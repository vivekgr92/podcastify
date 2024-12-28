import type { Express } from "express";
import express from "express";
import { setupAuth } from "./auth.js";
import { db } from "../db/index.js";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  podcasts,
  playlists,
  playlistItems,
  progress,
  userUsage,
  users,
} from "../db/schema.js";
import { logger } from "./services/logging.js";
import { ttsService } from "./services/tts.js";
import { eq, and, sql, desc } from "drizzle-orm";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import Stripe from "stripe";

const PODIFY_TOKEN_RATE = 0.005;
const PODIFY_MARGIN = 0.6;

// Plan-specific usage limits
const USAGE_LIMITS = {
  free: {
    articleLimit: 3,
    podifyTokenLimit: 10000,
  },
  basic: {
    articleLimit: 20,
    podifyTokenLimit: 40000,
  },
  pro: {
    articleLimit: 50,
    podifyTokenLimit: 60000,
  },
};

// Helper to get limits based on subscription status
function getLimits(subscriptionStatus: string) {
  switch (subscriptionStatus) {
    case "active:basic":
      return USAGE_LIMITS.basic;
    case "active:pro":
      return USAGE_LIMITS.pro;
    default:
      return USAGE_LIMITS.free;
  }
}

// Initialize Stripe with proper API version and error handling
let stripe: Stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
    typescript: true,
  });

  logger.info("Stripe initialized successfully");
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to initialize Stripe: ${errorMessage}`);
  throw error;
}

export function registerRoutes(app: Express) {
  setupAuth(app);

  // Parse as raw body for Stripe webhook requests, json for others
  app.use((req, res, next) => {
    if (req.originalUrl === "/api/webhooks/stripe") {
      express.raw({ type: "application/json" })(req, res, next);
    } else {
      express.json()(req, res, next);
    }
  });

  // Create subscription endpoint with enhanced error handling
  app.post("/api/create-subscription", async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { priceId } = req.body;
      if (!priceId) {
        return res.status(400).json({ error: "Price ID is required" });
      }

      logger.info(
        `Creating subscription for user ${req.user.id} with price ${priceId}`,
      );

      // Get or create customer
      let customer;
      const existingCustomers = await stripe.customers.list({
        email: req.user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        // Update customer metadata if needed
        await stripe.customers.update(customer.id, {
          metadata: {
            userId: req.user.id.toString(),
          },
          email: req.user.email, // Ensure email is up to date
        });
        logger.info(`Using existing customer: ${customer.id}`);
      } else {
        customer = await stripe.customers.create({
          email: req.user.email,
          metadata: {
            userId: req.user.id.toString(),
          },
        });
        logger.info(`Created new customer: ${customer.id}`);
      }

      // Create the subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_options: {
            card: {
              request_three_d_secure: "automatic",
            },
          },
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          userId: req.user.id.toString(),
          customerEmail: req.user.email, // Add email to metadata
        },
      });

      logger.info(`Created subscription: ${subscription.id}`);

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

      if (!paymentIntent?.client_secret) {
        throw new Error("Failed to get client secret from payment intent");
      }

      // Update user's subscription status to 'pending'
      await db
        .update(users)
        .set({
          subscriptionStatus: "pending",
          subscriptionId: subscription.id,
        })
        .where(eq(users.id, req.user.id));

      res.json({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      logger.error(
        `Subscription creation error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create subscription";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Webhook handler for subscription events
  app.post("/api/webhooks/stripe", async (req, res) => {
    let event: Stripe.Event;

    try {
      const sig = req.headers["stripe-signature"];

      if (!sig) {
        logger.error("Missing Stripe signature");
        return res.status(400).json({ error: "Missing stripe signature" });
      }

      // Ensure we have the webhook secret
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        logger.error("Missing STRIPE_WEBHOOK_SECRET environment variable");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      logger.info(`\nStripe Signature: ${sig}`);
      logger.info(`\nWebhook signature: ${process.env.STRIPE_WEBHOOK_SECRET}`);

      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`Webhook signature verification failed: ${error}`);
        return res.status(400).json({ error: `Webhook Error: ${error}` });
      }

      logger.info(`Successfully verified webhook event: ${event.type}`);

      // Handle the event
      switch (event.type) {
        case "invoice.payment_succeeded":
          const invoice = event.data.object as Stripe.Invoice;
          if (!invoice.subscription) {
            logger.error("Invoice missing subscription reference");
            return res.status(400).json({ error: "Invalid invoice data" });
          }

          try {
            const subscription = await stripe.subscriptions.retrieve(
              invoice.subscription as string,
            );
            if (!subscription.metadata.userId) {
              logger.warn(
                `Subscription missing userId in metadata for subscription ${subscription.id}`,
              );
              return res
                .status(400)
                .json({ error: "Invalid subscription metadata" });
            }

            // Determine subscription type from price metadata
            const priceId = subscription.items.data[0].price.id;
            const subscriptionType = priceId.includes("annual")
              ? "active:proAnnual"
              : "active:pro";

            const [updatedUser] = await db
              .update(users)
              .set({
                subscriptionStatus: subscriptionType,
                subscriptionId: subscription.id,
                currentPeriodEnd: new Date(
                  subscription.current_period_end * 1000,
                ),
              })
              .where(eq(users.id, parseInt(subscription.metadata.userId)))
              .returning();

            // Reset usage for the current month
            const currentMonth = new Date().toISOString().slice(0, 7);
            await db
              .update(userUsage)
              .set({
                articlesConverted: 0,
                tokensUsed: 0,
                podifyTokens: "0",
                lastConversion: new Date(),
              })
              .where(
                and(
                  eq(userUsage.userId, parseInt(subscription.metadata.userId)),
                  eq(userUsage.monthYear, currentMonth),
                ),
              );

            if (!updatedUser) {
              throw new Error(
                `Failed to update subscription status for user ${subscription.metadata.userId}`,
              );
            }

            logger.info(
              `Successfully processed payment for subscription ${subscription.id}`,
            );
          } catch (error) {
            logger.error(
              `Failed to process subscription payment: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
          }
          break;
        case "invoice.payment_failed":
          const failedInvoice = event.data.object as Stripe.Invoice;
          const failedSubscription = await stripe.subscriptions.retrieve(
            failedInvoice.subscription as string,
          );

          if (failedSubscription.metadata.userId) {
            await db
              .update(users)
              .set({
                subscriptionStatus: "payment_failed",
              })
              .where(
                eq(users.id, parseInt(failedSubscription.metadata.userId)),
              );

            logger.info(
              `Updated subscription status to payment_failed for user ${failedSubscription.metadata.userId}`,
            );
          }
          break;
        case "customer.subscription.updated":
          const updatedSubscription = event.data.object as Stripe.Subscription;
          if (updatedSubscription.metadata.userId) {
            await db
              .update(users)
              .set({
                subscriptionStatus: updatedSubscription.status,
                currentPeriodEnd: new Date(
                  updatedSubscription.current_period_end * 1000,
                ),
              })
              .where(
                eq(users.id, parseInt(updatedSubscription.metadata.userId)),
              );

            logger.info(
              `Updated subscription status for user ${updatedSubscription.metadata.userId}`,
            );
          }
          break;
        case "customer.subscription.deleted":
          const deletedSubscription = event.data.object as Stripe.Subscription;
          if (deletedSubscription.metadata.userId) {
            await db
              .update(users)
              .set({
                subscriptionStatus: "canceled",
                subscriptionId: null,
                currentPeriodEnd: null,
              })
              .where(
                eq(users.id, parseInt(deletedSubscription.metadata.userId)),
              );

            logger.info(
              `Canceled subscription for user ${deletedSubscription.metadata.userId}`,
            );
          }
          break;
      }

      res.json({ received: true });
    } catch (error) {
      logger.error(
        `Webhook error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorMessage =
        error instanceof Error ? error.message : "Webhook failed";
      res.status(400).json({ error: errorMessage });
    }
  });

  // Helper function to convert raw tokens to Podify Tokens
  function convertToPodifyTokens(totalCost: number): number {
    if (totalCost <= 0) return 0; // No tokens for zero or negative costs
    if (PODIFY_MARGIN <= 0 || PODIFY_MARGIN >= 1) {
      throw new Error("PODIFY_MARGIN must be between 0 and 1");
    }

    // Add margin to the cost
    const costWithMargin = totalCost / (1 - PODIFY_MARGIN);

    // Convert to Podify tokens (round up to avoid undercharging)
    return Math.ceil(costWithMargin / PODIFY_TOKEN_RATE);
  }

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = "./uploads";
      try {
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err as Error, dir);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,
        file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
      );
    },
  });

  const upload = multer({ storage });

  // Create Setup Intent endpoint
  app.post("/api/create-setup-intent", async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get or create customer
      let customer;
      const existingCustomers = await stripe.customers.list({
        email: req.user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: req.user.email,
        });
      }

      // Create a SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ["card"],
      });

      res.json({
        clientSecret: setupIntent.client_secret,
      });
    } catch (error) {
      console.error("Setup intent error:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create setup intent";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Main ---Text-to-speech conversion endpoint
  app.post("/api/podcast", upload.single("file"), async (req, res) => {
    const file = req.file;
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({
          error: "Not authenticated",
          type: "auth",
        });
      }

      if (!file) {
        return res.status(400).json({
          error: "No file uploaded",
          type: "validation",
        });
      }

      // Process the uploaded file
      let fileContent: string;
      try {
        const fileBuffer = await fs.readFile(file.path);

        if (file.mimetype === "application/pdf") {
          const pdfData = await pdfParse(fileBuffer);
          fileContent = pdfData.text;
        } else if (file.mimetype === "text/plain") {
          fileContent = fileBuffer.toString("utf-8");
        } else {
          throw new Error("Please upload a PDF or text file");
        }

        fileContent = fileContent
          .replace(/[^\x20-\x7E\n\r\t]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (
          !fileContent ||
          typeof fileContent !== "string" ||
          fileContent.length === 0
        ) {
          throw new Error("Invalid file content");
        }
      } catch (error) {
        throw new Error(
          `File processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Get current month's usage before processing
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [usageData] = await db
        .select({
          articlesConverted: userUsage.articlesConverted,
          tokensUsed: userUsage.podifyTokens,
        })
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, user.id),
            eq(userUsage.monthYear, currentMonth),
          ),
        )
        .limit(1);

      const currentArticles = usageData?.articlesConverted ?? 0;
      const currentPodifyTokens = Number(usageData?.tokensUsed ?? 0);

      // First calculate estimated pricing to check limits
      await logger.info(
        "Calculating estimated pricing and checking usage limits",
      );
      const estimatedPricing = await ttsService.calculatePricing(
        fileContent,
        [],
        [],
        true,
      );

      if (!estimatedPricing) {
        throw new Error("Failed to calculate pricing estimation");
      }

      // Calculate estimated total tokens and check usage limits
      const currentLimits = getLimits(user.subscriptionStatus || "free");
      const wouldExceedArticles = currentArticles >= currentLimits.articleLimit;
      const estimatedTotalCost = estimatedPricing.totalCost;
      const estimatedPodifyTokens = convertToPodifyTokens(estimatedTotalCost);

      const wouldExceedPodifyTokens =
        currentPodifyTokens + estimatedPodifyTokens >
        currentLimits.podifyTokenLimit;

      const remainingArticles =
        currentLimits.articleLimit === Infinity
          ? Infinity
          : Math.max(0, currentLimits.articleLimit - currentArticles);
      const remainingPodifyTokens = Math.max(
        0,
        currentLimits.podifyTokenLimit - currentPodifyTokens,
      );

      await logger.info([
        `Estimated Podify Tokens: ${estimatedPodifyTokens}`,
        `\n\nUsage limits check for user ${user.id}:\n`,
        `Current articles: ${currentArticles}/${ARTICLE_LIMIT}\n`,
        `Current Podify tokens: ${currentPodifyTokens}/${PODIFY_TOKEN_LIMIT}\n`,
        `Would exceed article limit: ${wouldExceedArticles}\n`,
        `Would exceed token limit: ${wouldExceedPodifyTokens}`,
      ]);

      // Check if usage limits would be exceeded
      if (wouldExceedArticles || wouldExceedPodifyTokens) {
        await logger.warn([
          "---------- USAGE LIMIT WARNING ----------\n",
          `User: ${user.id}\n`,
          `Articles: ${currentArticles}/${ARTICLE_LIMIT} (${wouldExceedArticles ? "exceeded" : "ok"})\n`,
          `Tokens: ${currentPodifyTokens}/${PODIFY_TOKEN_LIMIT} (${wouldExceedPodifyTokens ? "would exceed" : "ok"})\n`,
          "-----------------------------------------\n",
        ]);

        return res.status(403).json({
          error: "Usage limit would be exceeded",
          message: "Please upgrade your plan to continue converting articles",
          type: "usage_limit",
          limits: {
            articles: {
              used: currentArticles,
              limit: ARTICLE_LIMIT,
              remaining: remainingArticles,
              wouldExceed: wouldExceedArticles,
            },
            tokens: {
              used: currentPodifyTokens,
              limit: PODIFY_TOKEN_LIMIT,
              remaining: remainingPodifyTokens,
              estimated: estimatedPodifyTokens,
              wouldExceed: wouldExceedPodifyTokens,
            },
          },
          pricing: {
            inputTokens: estimatedPricing.inputTokens,
            outputTokens: estimatedPricing.outputTokens,
            estimatedCost: estimatedPricing.totalCost,
          },
        });
      }
      // Generate audio only if usage limits allow
      await logger.info("Starting audio generation process");
      const { audioBuffer, duration, usage } =
        await ttsService.generateConversation(fileContent);

      if (!audioBuffer || !duration || !usage) {
        throw new Error(
          "Invalid response from TTS service: Missing required fields",
        );
      }

      await logger.info([
        `Audio generation completed:`,
        `Duration: ${duration}s`,
        `Actual tokens used: ${usage.inputTokens + usage.outputTokens}`,
        `Actual cost: ${usage.totalCost}`,
      ]);

      // Create podcast and update usage in a single transaction
      const result = await db.transaction(async (tx) => {
        // Calculate Podify tokens based on actual usage
        const podifyTokensForUsage = convertToPodifyTokens(usage.totalCost);

        // Update usage statistics with actual usage from the conversion
        const [updatedUsage] = await tx
          .insert(userUsage)
          .values({
            userId: user.id,
            articlesConverted: 1,
            tokensUsed: usage.inputTokens + usage.outputTokens,
            podifyTokens: sql`${podifyTokensForUsage}::decimal`,
            monthYear: currentMonth,
            lastConversion: new Date(),
          })
          .onConflictDoUpdate({
            target: [userUsage.userId, userUsage.monthYear],
            set: {
              articlesConverted: sql`${userUsage.articlesConverted} + 1`,
              tokensUsed: sql`${userUsage.tokensUsed} + ${sql.raw(`${usage.inputTokens + usage.outputTokens}`)}`,
              podifyTokens: sql`COALESCE(${userUsage.podifyTokens}, 0) + ${sql.raw(`${podifyTokensForUsage}`)}::decimal`,
              lastConversion: new Date(),
            },
          })
          .returning();

        if (!updatedUsage) {
          throw new Error("Failed to update usage statistics");
        }

        await logger.info([
          "\n\n---------- Updated Usage ----------\n",
          `Updated usage for user ${user.id}:\n`,
          `Articles: ${updatedUsage.articlesConverted}/${ARTICLE_LIMIT}\n`,
          `Podify Tokens: ${updatedUsage.podifyTokens}/${PODIFY_TOKEN_LIMIT}`,
        ]);

        // Save the audio file
        const timestamp = Date.now();
        const sanitizedFileName = file.originalname
          .replace(/\.[^/.]+$/, "") // Remove extension
          .replace(/[^a-zA-Z0-9]/g, "_"); // Replace invalid chars
        const audioFileName = `${timestamp}-${sanitizedFileName}.mp3`;
        const audioPath = path.join("./uploads", audioFileName);

        try {
          await fs.mkdir("./uploads", { recursive: true });
          await fs.writeFile(audioPath, audioBuffer);
          await logger.info(`Successfully saved audio file: ${audioFileName}`);
        } catch (writeError) {
          const errorMessage =
            writeError instanceof Error
              ? writeError.message
              : String(writeError);
          await logger.error(`Failed to save audio file: ${errorMessage}`);
          throw new Error(`Failed to save audio file: ${errorMessage}`);
        }

        // Create podcast entry
        const [newPodcast] = await tx
          .insert(podcasts)
          .values({
            userId: user.id,
            title: file.originalname.replace(/\.[^/.]+$/, ""),
            description: "Generated from uploaded document using AI voices",
            audioUrl: `/uploads/${audioFileName}`,
            duration: duration,
            type: "tts",
          })
          .returning();

        if (!newPodcast) {
          throw new Error("Failed to create podcast entry in database");
        }

        await logger.info(
          `Successfully created podcast entry with ID: ${newPodcast.id}`,
        );
        return { newPodcast, audioFileName };
      });

      if (!result?.newPodcast) {
        throw new Error("Failed to complete podcast creation transaction");
      }

      res.json({
        message: "Podcast created successfully",
        podcast: result.newPodcast,
        audioUrl: result.newPodcast.audioUrl,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await logger.error(`Error processing podcast: ${errorMessage}`);

      const isValidationError =
        error instanceof Error && error.message.includes("Please upload");
      res.status(isValidationError ? 400 : 500).json({
        error: errorMessage,
        type: isValidationError ? "validation" : "server",
      });
    } finally {
      // Clean up the uploaded file
      if (file?.path) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          const cleanupError =
            unlinkError instanceof Error
              ? unlinkError.message
              : "Unknown error";
          await logger.error(
            `Error cleaning up uploaded file: ${cleanupError}`,
          );
        }
      }
    }
  });

  // Audio streaming endpoint
  app.get("/uploads/:filename", async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, "..", "uploads", filename);

    try {
      // Check if file exists first
      const fileExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        logger.warn(`File not found: ${filePath}`);
        return res.status(404).json({
          error: "Audio file not found",
          type: "not_found",
        });
      }

      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (
          isNaN(start) ||
          isNaN(end) ||
          start >= fileSize ||
          start > end ||
          end >= fileSize
        ) {
          return res.status(416).json({
            error: "Requested range not satisfiable",
            type: "validation",
          });
        }

        const chunksize = end - start + 1;
        const file = fsSync.createReadStream(filePath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "audio/mpeg",
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": "audio/mpeg",
        };
        res.writeHead(200, head);
        fsSync.createReadStream(filePath).pipe(res);
      }
    } catch (error) {
      await logger.error(
        `Error streaming audio: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        error: "Failed to stream audio file",
        type: "server",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Usage check endpoint
  app.get("/api/user/usage/check", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const currentMonth = new Date().toISOString().slice(0, 7);
      let [usage] = await db
        .select({
          articlesConverted: userUsage.articlesConverted,
          tokensUsed: userUsage.tokensUsed,
          podifyTokens: userUsage.podifyTokens,
          lastConversion: userUsage.lastConversion,
          monthYear: userUsage.monthYear,
        })
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, req.user.id),
            eq(userUsage.monthYear, currentMonth),
          ),
        )
        .limit(1);

      // If no usage record exists, create one with default values
      if (!usage) {
        const [newUsage] = await db
          .insert(userUsage)
          .values({
            userId: req.user.id,
            articlesConverted: 0,
            tokensUsed: 0,
            podifyTokens: "0",
            monthYear: currentMonth,
          })
          .returning();

        usage = newUsage;
      }

      const podifyTokensUsed = Number(usage.podifyTokens) || 0;
      const podifyTokenLimit = PODIFY_TOKEN_LIMIT;

      const hasReachedLimit =
        (usage.articlesConverted ?? 0) >= ARTICLE_LIMIT ||
        podifyTokensUsed >= podifyTokenLimit;

      res.json({
        hasReachedLimit,
        limits: {
          articles: {
            used: usage.articlesConverted || 0,
            limit: ARTICLE_LIMIT,
            remaining: Math.max(
              0,
              ARTICLE_LIMIT - (usage.articlesConverted || 0),
            ),
          },
          tokens: {
            used: usage.tokensUsed || 0,
            limit: PODIFY_TOKEN_LIMIT,
            remaining: Math.max(
              0,
              PODIFY_TOKEN_LIMIT - (usage.tokensUsed || 0),
            ),
            podifyTokens: {
              used: podifyTokensUsed,
              limit: podifyTokenLimit,
              remaining: Math.max(0, podifyTokenLimit - podifyTokensUsed),
            },
          },
        },
        currentPeriod: {
          month: currentMonth,
          resetsOn: new Date(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            1,
          ).toISOString(),
        },
        upgradePlans: {
          monthly: {
            name: "Pro",
            price: 9.99,
            features: [
              "Unlimited articles",
              "40,000 Podify Tokens per month",
              "Priority support",
            ],
          },
          annual: {
            name: "Pro Annual",
            price: 99.99,
            features: [
              "Unlimited articles",
              "60,000 Podify Tokens per month",
              "Priority support",
              "2 months free",
            ],
          },
        },
      });
    } catch (error) {
      await logger.error([
        "Error checking usage limits:",
        error instanceof Error ? error.message : String(error),
      ]);
      res.status(500).send("Failed to check usage limits");
    }
  });

  // Get user's podcasts
  app.get("/api/podcasts", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const userPodcasts = await db
        .select()
        .from(podcasts)
        .where(eq(podcasts.userId, req.user.id));

      res.json(userPodcasts);
    } catch (error) {
      res.status(500).send("Failed to fetch podcasts");
    }
  });

  // Delete podcast
  app.delete("/api/podcasts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Not authenticated",
          type: "auth",
        });
      }

      const podcastId = parseInt(req.params.id);
      if (isNaN(podcastId)) {
        return res.status(400).json({
          error: "Invalid podcast ID",
          type: "validation",
        });
      }

      // Log the deletion attempt
      await logger.info(
        `Attempting to delete podcast ${podcastId} by user ${req.user.id}`,
      );

      // First fetch the podcast to get the file path
      const [podcast] = await db
        .select()
        .from(podcasts)
        .where(
          and(eq(podcasts.id, podcastId), eq(podcasts.userId, req.user.id)),
        )
        .limit(1);

      if (!podcast) {
        return res.status(404).json({
          error: "Podcast not found or unauthorized",
          type: "not_found",
        });
      }

      // Delete the audio file if it exists
      if (podcast.audioUrl) {
        const filePath = path.join(__dirname, "..", podcast.audioUrl);
        try {
          const fileExists = await fs
            .access(filePath)
            .then(() => true)
            .catch(() => false);

          if (fileExists) {
            await fs.unlink(filePath);
            await logger.info(
              `Successfully deleted audio file for podcast ${podcastId}`,
            );
          } else {
            await logger.warn(
              `Audio file not found for podcast ${podcastId}: ${filePath}`,
            );
          }
        } catch (error) {
          await logger.error(
            `Error deleting audio file for podcast ${podcastId}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Continue with database deletion even if file deletion fails
        }
      }

      try {
        // Delete the database record
        const [deletedPodcast] = await db
          .delete(podcasts)
          .where(
            and(eq(podcasts.id, podcastId), eq(podcasts.userId, req.user.id)),
          )
          .returning();

        if (!deletedPodcast) {
          await logger.warn(
            `No podcast found to delete with id ${podcastId} for user ${req.user.id}`,
          );
          return res.status(404).json({
            error: "Podcast not found or already deleted",
            type: "not_found",
          });
        }

        await logger.info(
          `Successfully deleted podcast ${podcastId} from database`,
        );

        res.json({
          message: "Podcast deleted successfully",
          id: podcastId,
        });
      } catch (dbError) {
        const errorMessage =
          dbError instanceof Error ? dbError.message : String(dbError);
        await logger.error(
          `Database error while deleting podcast: ${errorMessage}`,
        );
        res.status(500).json({
          error: "Failed to delete podcast",
          type: "server",
          message: "Database error occurred while deleting the podcast",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.error(`Error in delete podcast route: ${errorMessage}`);
      res.status(500).json({
        error: "Failed to delete podcast",
        type: "server",
        message: "An unexpected error occurred",
      });
    }
  });

  // Get user's playlists
  app.get("/api/playlists", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const userPlaylists = await db
        .select()
        .from(playlists)
        .where(eq(playlists.userId, req.user.id));

      res.json(userPlaylists);
    } catch (error) {
      res.status(500).send("Failed to fetch playlists");
    }
  });

  // Create new playlist
  app.post("/api/playlists", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const [newPlaylist] = await db
        .insert(playlists)
        .values({
          userId: req.user.id,
          title: req.body.title,
          description: req.body.description,
          coverImage: req.body.coverImage,
        })
        .returning();

      res.json(newPlaylist);
    } catch (error) {
      res.status(500).send("Failed to create playlist");
    }
  });

  // Add podcast to playlist
  app.post("/api/playlists/:playlistId/items", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const [newItem] = await db
        .insert(playlistItems)
        .values({
          playlistId: parseInt(req.params.playlistId),
          podcastId: req.body.podcastId,
          position: req.body.position,
        })
        .returning();

      res.json(newItem);
    } catch (error) {
      res.status(500).send("Failed to add item to playlist");
    }
  });

  // Update listening progress
  app.post("/api/progress", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const [updatedProgress] = await db
        .insert(progress)
        .values({
          userId: req.user.id,
          podcastId: req.body.podcastId,
          position: req.body.position,
          completed: req.body.completed,
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.podcastId],
          set: {
            position: req.body.position,
            completed: req.body.completed,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json(updatedProgress);
    } catch (error) {
      res.status(500).send("Failed to update progress");
    }
  });

  // SSE endpoint for TTS progress updates
  app.get("/api/tts/progress", (req, res) => {
    console.log("Client connected to SSE endpoint");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial progress
    res.write(`data: ${JSON.stringify({ progress: 0 })}\n\n`);

    const sendProgress = (progress: number) => {
      console.log("Sending progress update:", progress);
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    };

    // Add this client to TTSService progress listeners
    ttsService.addProgressListener(sendProgress);

    // Remove listener when client disconnects
    req.on("close", () => {
      ttsService.removeProgressListener(sendProgress);
      console.log("Client disconnected from SSE endpoint");
    });
  });

  // Text-to-speech conversion
  // Calculate pricing estimate
  app.post("/api/podcast/pricing", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Not authenticated",
          type: "auth",
        });
      }

      const { text } = req.body;
      if (!text) {
        return res.status(400).json({
          error: "Text content is required",
          type: "validation",
        });
      }

      // Calculate initial pricing estimate
      const pricingDetails = await ttsService.calculatePricing(text, [], []);
      if (!pricingDetails) {
        throw new Error("Failed to calculate pricing details");
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      const [usage] = await db
        .select({
          articlesConverted: userUsage.articlesConverted,
          tokensUsed: userUsage.tokensUsed,
        })
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, req.user.id),
            eq(userUsage.monthYear, currentMonth),
          ),
        )
        .limit(1);

      const currentArticles = usage?.articlesConverted ?? 0;
      const currentTokens = usage?.tokensUsed ?? 0;
      const totalTokens =
        pricingDetails.inputTokens + pricingDetails.outputTokens;

      await logger.info([
        `Pricing calculation for user ${req.user.id}:`,
        `Input tokens: ${pricingDetails.inputTokens}`,
        `Estimated output tokens: ${pricingDetails.outputTokens}`,
        `Total cost: $${pricingDetails.totalCost.toFixed(4)}`,
      ]);

      res.json({
        inputTokens: pricingDetails.inputTokens,
        outputTokens: pricingDetails.outputTokens,
        totalCost: pricingDetails.totalCost,
        currentUsage: {
          articles: currentArticles,
          tokens: currentTokens,
        },
        limits: {
          articles: {
            used: currentArticles,
            limit: ARTICLE_LIMIT,
            remaining: Math.max(0, ARTICLE_LIMIT - currentArticles),
            wouldExceed: currentArticles >= ARTICLE_LIMIT,
          },
          tokens: {
            used: currentTokens,
            limit: PODIFY_TOKEN_LIMIT,
            remaining: Math.max(0, PODIFY_TOKEN_LIMIT - currentTokens),
            wouldExceed: currentTokens + totalTokens > PODIFY_TOKEN_LIMIT,
            estimated: totalTokens,
          },
        },
      });
    } catch (error) {
      await logger.error([
        "Error calculating pricing:",
        error instanceof Error ? error.message : String(error),
      ]);
      res.status(500).json({
        error: "Failed to calculate pricing",
        type: "server",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return app;
}
