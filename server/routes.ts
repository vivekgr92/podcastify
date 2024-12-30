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
import { crypto } from "./auth.js";

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

// Constants for usage limits
const PODIFY_TOKEN_RATE = 0.005;
const PODIFY_MARGIN = 0.6;

type SubscriptionTier =
  | "free"
  | "Basic Plan:monthly"
  | "Pro Plan:monthly"
  | "Enterprise Plan:monthly";

const USAGE_LIMITS = {
  free: {
    articleLimit: 3,
    podifyTokenLimit: 10000,
  },
  "Basic Plan:monthly": {
    articleLimit: 20,
    podifyTokenLimit: 40000,
  },
  "Pro Plan:monthly": {
    articleLimit: 50,
    podifyTokenLimit: 60000,
  },
  "Enterprise Plan:monthly": {
    articleLimit: Infinity,
    podifyTokenLimit: 1000000,
  },
} as const;

// Helper to get limits based on subscription status with proper type checking
function getLimits(subscriptionStatus: string | null | undefined) {
  const defaultLimits = USAGE_LIMITS.free;
  const normalizedStatus = (subscriptionStatus || "free") as SubscriptionTier;
  const limits = USAGE_LIMITS[normalizedStatus] || defaultLimits;
  return {
    articleLimit: limits.articleLimit,
    podifyTokenLimit: limits.podifyTokenLimit,
  };
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
            const price = await stripe.prices.retrieve(
              subscription.items.data[0].price.id,
              {
                expand: ["product"],
              },
            );
            const productName = (price.product as Stripe.Product).name;
            const billingType = price.metadata.billing_period;

            // Combine the values
            const subscriptionType = `${productName}:${billingType}`;

            logger.info(
              `\n\n ------Subscription Type ------- ${subscriptionType}`,
            );

            const [updatedUser] = await db
              .update(users)
              .set({
                subscriptionStatus: "active",
                subscriptionType: subscriptionType,
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
          const userId = parseInt(updatedSubscription.metadata.userId);

          if (updatedSubscription.metadata.userId) {
            // Determine the cancellation state
            const isCanceled =
              updatedSubscription.status === "canceled" ||
              updatedSubscription.cancel_at_period_end ||
              updatedSubscription.ended_at !== null;

            // Update user subscription status
            await db
              .update(users)
              .set({
                subscriptionType: "free",
                subscriptionStatus: isCanceled
                  ? "canceled"
                  : updatedSubscription.status,
                currentPeriodEnd: new Date(
                  updatedSubscription.current_period_end * 1000,
                ),
              })
              .where(eq(users.id, userId));

            logger.info(
              `Updated subscription status for user ${userId}: ${
                isCanceled ? "canceled" : updatedSubscription.status
              }`,
            );
          } else {
            // Update other statuses
            await db
              .update(users)
              .set({
                subscriptionStatus: updatedSubscription.status,
                currentPeriodEnd: new Date(
                  updatedSubscription.current_period_end * 1000,
                ),
              })
              .where(eq(users.id, userId));

            logger.info(
              `Updated subscription status for user ${userId}: ${updatedSubscription.status}`,
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
      const currentLimits = getLimits(user.subscriptionStatus);

      let PODIFY_TOKEN_LIMIT = currentLimits.podifyTokenLimit;
      let ARTICLE_LIMIT = currentLimits.articleLimit;

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
          `Articles: ${currentArticles}/${currentLimits.articleLimit} (${wouldExceedArticles ? "exceeded" : "ok"})\n`,
          `Tokens: ${currentPodifyTokens}/${currentLimits.podifyTokenLimit} (${wouldExceedPodifyTokens ? "would exceed" : "ok"})\n`,
          "-----------------------------------------\n",
        ]);

        return res.status(403).json({
          error: "Usage limit would be exceeded",
          message: "Please upgrade your plan to continue converting articles",
          type: "usage_limit",
          limits: {
            articles: {
              used: currentArticles,
              limit: currentLimits.articleLimit,
              remaining: remainingArticles,
              wouldExceed: wouldExceedArticles,
            },
            tokens: {
              used: currentPodifyTokens,
              limit: currentLimits.podifyTokenLimit,
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
          `Articles: ${updatedUsage.articlesConverted}/${currentLimits.articleLimit}\n`,
          `Podify Tokens: ${updatedUsage.podifyTokens}/${currentLimits.podifyTokenLimit}`,
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

      const podifyTokensUsed = Number(usage?.podifyTokens || "0");
      const limits = getLimits(req.user.subscriptionStatus || "free");
      const { articleLimit, podifyTokenLimit } = limits;

      const hasReachedLimit =
        (usage?.articlesConverted ?? 0) >= articleLimit ||
        podifyTokensUsed >= podifyTokenLimit;

      res.json({
        hasReachedLimit,
        limits: {
          articles: {
            used: usage?.articlesConverted || 0,
            limit: articleLimit,
            remaining: Math.max(
              0,
              articleLimit - (usage?.articlesConverted || 0),
            ),
          },
          tokens: {
            used: usage?.tokensUsed || 0,
            limit: podifyTokenLimit,
            remaining: Math.max(0, podifyTokenLimit - (usage?.tokensUsed || 0)),
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
      });
    } catch (error) {
      logger.error(
        `Usage check error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).send("Failed to check usage limits");
    }
  });

  // Create Portal Session endpoint with proper error handling
  app.post("/api/create-portal-session", async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = req.user;
      if (!user.email) {
        return res.status(400).json({ error: "User email is required" });
      }

      // Get customer ID from Stripe
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (!existingCustomers.data.length) {
        return res.status(404).json({ error: "No subscription found" });
      }

      const customer = existingCustomers.data[0];

      // Create the portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/billing`,
      });

      res.json({ url: session.url });
    } catch (error) {
      logger.error(
        `Portal session error: ${error instanceof Error ? error.message : String(error)}`,
      );
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to create portal session";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get user's podcasts with proper type checking
  app.get("/api/podcasts", async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const userPodcasts = await db
        .select()
        .from(podcasts)
        .where(eq(podcasts.userId, user.id));

      res.json(userPodcasts);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: "Failed to fetch podcasts",
        message: errorMessage,
      });
    }
  });

  app.delete("/api/podcasts/:id", async (req, res) => {
    try {
      const user = req.user;
      if (!user?.id) {
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
        `Attempting to delete podcast ${podcastId} by user ${user.id}`,
      );

      // First check if the podcast exists and belongs to the user
      const [podcast] = await db
        .select()
        .from(podcasts)
        .where(and(eq(podcasts.id, podcastId), eq(podcasts.userId, user.id)))
        .limit(1);

      if (!podcast) {
        return res.status(404).json({
          error: "Podcast not found",
          type: "not_found",
        });
      }

      // Delete the podcast
      await db
        .delete(podcasts)
        .where(and(eq(podcasts.id, podcastId), eq(podcasts.userId, user.id)));

      // Try to delete the associated audio file
      if (podcast.audioUrl) {
        const audioPath = path.join(
          __dirname,
          "..",
          podcast.audioUrl.replace(/^\//, ""),
        );
        try {
          await fs.unlink(audioPath);
          await logger.info(`Deleted audio file: ${audioPath}`);
        } catch (error) {
          // Log but don't fail if file deletion fails
          await logger.warn(
            `Failed to delete audio file ${audioPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      res.json({
        message: "Podcast deleted successfully",
        id: podcastId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await logger.error(`Error deleting podcast: ${errorMessage}`);
      res.status(500).json({
        error: "Failed to delete podcast",
        type: "server",
        message: errorMessage,
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

      const limits = getLimits(req.user.subscriptionStatus);
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
            limit: limits.articleLimit,
            remaining: Math.max(0, limits.articleLimit - currentArticles),
            wouldExceed: currentArticles >= limits.articleLimit,
          },
          tokens: {
            used: currentTokens,
            limit: limits.podifyTokenLimit,
            remaining: Math.max(0, limits.podifyTokenLimit - currentTokens),
            wouldExceed: currentTokens + totalTokens > limits.podifyTokenLimit,
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

  // Reset password endpoint
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;

      // Find user with provided email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await crypto.hash(tempPassword);

      // Update user's password
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, user.id));

      // Send email with SendGrid
      const { default: sgMail } = await import("@sendgrid/mail");
      
      if (!process.env.SENDGRID_API_KEY) {
        throw new Error("SENDGRID_API_KEY is not configured");
      }
      
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const fromEmail = process.env.SENDGRID_FROM_EMAIL;
      if (!fromEmail) {
        throw new Error("SENDGRID_FROM_EMAIL is not configured");
      }

      const msg = {
        to: email,
        from: fromEmail,
        subject: "Your Temporary Password",
        text: `Your temporary password is: ${tempPassword}\nPlease change it after logging in.`,
        html: `<p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please change it after logging in.</p>`,
      };

      await sgMail.send(msg);

      res.json({
        message: "Password reset email sent successfully",
      });
    } catch (error) {
      logger.error(
        `Password reset error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Registration route update
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).send("User already exists");
      }

      // Hash password
      const hashedPassword = await crypto.hash(password);

      // Create new user with default subscription status
      const [user] = await db
        .insert(users)
        .values({
          username,
          email,
          password: hashedPassword,
          displayName: username,
          subscriptionStatus: "inactive",
          subscriptionType: "free",
          isAdmin: email.endsWith("@admin.com"),
        })
        .returning();

      if (!user) {
        throw new Error("Failed to create user");
      }

      // Initialize usage tracking for the new user
      const currentMonth = new Date().toISOString().slice(0, 7);
      await db.insert(userUsage).values({
        userId: user.id,
        articlesConverted: 0,
        tokensUsed: 0,
        podifyTokens: "0",
        monthYear: currentMonth,
      });

      // Start session
      req.logIn(user, (err) => {
        if (err) {
          throw err;
        }
        res.json({ message: "Registration successful" });
      });
    } catch (error) {
      logger.error(
        `Registration error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).send("Registration failed");
    }
  });

  return app;
}
