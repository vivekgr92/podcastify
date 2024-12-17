import type { Express } from "express";
import express from "express";
import { setupAuth } from "./auth";
import { db } from "../db";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import * as fsSync from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { podcasts, playlists, playlistItems, progress, userUsage } from "@db/schema";
import { logger } from "./services/logging";
import { ttsService } from "./services/tts";
import { eq, and, sql } from "drizzle-orm";
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { ttsService } from "./services/tts";
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Configure multer for file uploads
// Constants for usage limits
const ARTICLE_LIMIT = 3;
const TOKEN_LIMIT = 50000;

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
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

export function registerRoutes(app: Express) {
  setupAuth(app);

  // Audio streaming endpoint
  app.get('/uploads/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'uploads', filename);

    try {
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (isNaN(start) || isNaN(end) || start >= fileSize || start > end || end >= fileSize) {
          res.status(416).send('Requested range not satisfiable');
          return;
        }
        const chunksize = (end - start) + 1;
        const file = fsSync.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
        };
        res.writeHead(200, head);
        fsSync.createReadStream(filePath).pipe(res);
      }
    } catch (error) {
      console.error('Error streaming audio:', error);
      res.status(500).send('Error streaming audio file');
    }
  });

  // Text-to-speech conversion endpoint
  app.post("/api/podcast", upload.single("file"), async (req, res) => {
    const file = req.file;
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({
          error: "Not authenticated",
          type: "auth"
        });
      }

      if (!file) {
        return res.status(400).json({
          error: "No file uploaded",
          type: "validation"
        });
      }

      // Process the uploaded file
      let fileContent: string;
      try {
        const fileBuffer = await fs.readFile(file.path);
        
        if (file.mimetype === 'application/pdf') {
          const pdfData = await pdfParse(fileBuffer);
          fileContent = pdfData.text;
        } else if (file.mimetype === 'text/plain') {
          fileContent = fileBuffer.toString('utf-8');
        } else {
          throw new Error("Please upload a PDF or text file");
        }

        fileContent = fileContent
          .replace(/[^\x20-\x7E\n\r\t]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!fileContent || typeof fileContent !== 'string' || fileContent.length === 0) {
          throw new Error('Invalid file content');
        }
      } catch (error) {
        throw new Error(`File processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Get current month's usage
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [usage] = await db
        .select()
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, user.id),
            eq(userUsage.monthYear, currentMonth)
          )
        )
        .limit(1);

      // Calculate pricing and tokens
      const pricingDetails = await ttsService.calculatePricing(fileContent);
      const estimatedTokens = pricingDetails.inputTokens + pricingDetails.estimatedOutputTokens;

      // Check usage limits
      const currentArticles = usage?.articlesConverted || 0;
      const currentTokens = usage?.tokensUsed || 0;
      const wouldExceedArticles = currentArticles >= ARTICLE_LIMIT;
      const wouldExceedTokens = (currentTokens + estimatedTokens) > TOKEN_LIMIT;
      const remainingArticles = Math.max(0, ARTICLE_LIMIT - currentArticles);
      const remainingTokens = Math.max(0, TOKEN_LIMIT - currentTokens);

      if (wouldExceedArticles || wouldExceedTokens) {
        await logger.info([
          `Usage limit exceeded for user ${user.id}:`,
          `Articles: ${currentArticles}/${ARTICLE_LIMIT}`,
          `Tokens: ${currentTokens}/${TOKEN_LIMIT}`
        ]);

        return res.status(403).json({
          error: "Usage limit would be exceeded",
          message: "Please upgrade your plan to continue converting articles",
          limits: {
            articles: {
              used: currentArticles,
              limit: ARTICLE_LIMIT,
              remaining: remainingArticles,
              wouldExceed: wouldExceedArticles
            },
            tokens: {
              used: currentTokens,
              limit: TOKEN_LIMIT,
              remaining: remainingTokens,
              estimated: estimatedTokens,
              wouldExceed: wouldExceedTokens
            }
          },
          pricing: pricingDetails,
          upgradePlans: {
            monthly: {
              name: "Pro",
              price: 9.99,
              features: [
                "Unlimited articles",
                "200,000 tokens per month",
                "Priority support"
              ]
            },
            annual: {
              name: "Pro Annual",
              price: 99.99,
              features: [
                "Unlimited articles",
                "300,000 tokens per month",
                "Priority support",
                "2 months free"
              ]
            }
          }
        });
      }

      // Generate audio and update usage
      try {
        const { audioBuffer, duration } = await ttsService.generateConversation(fileContent);
        
        // Update usage statistics
        await db.transaction(async (tx) => {
          const [updatedUsage] = await tx
            .insert(userUsage)
            .values({
              userId: user.id,
              articlesConverted: currentArticles + 1,
              tokensUsed: currentTokens + estimatedTokens,
              monthYear: currentMonth,
              lastConversion: new Date(),
            })
            .onConflictDoUpdate({
              target: [userUsage.userId, userUsage.monthYear],
              set: {
                articlesConverted: sql`${userUsage.articlesConverted} + 1`,
                tokensUsed: sql`${userUsage.tokensUsed} + ${estimatedTokens}`,
                lastConversion: new Date(),
              },
            })
            .returning();

          if (!updatedUsage) {
            throw new Error('Failed to update usage statistics');
          }

          await logger.info([
            `Updated usage for user ${user.id}:`,
            `Articles: ${updatedUsage.articlesConverted}/${ARTICLE_LIMIT}`,
            `Tokens: ${updatedUsage.tokensUsed}/${TOKEN_LIMIT}`
          ]);

          // Save the audio file
          const audioFileName = `${Date.now()}-${file.originalname}.mp3`;
          const audioPath = path.join("./uploads", audioFileName);
          await fs.writeFile(audioPath, audioBuffer);

          // Create podcast entry
          const [newPodcast] = await tx
            .insert(podcasts)
            .values({
              userId: user.id,
              title: file.originalname.replace(/\.[^/.]+$/, ""),
              description: "Generated from uploaded document using AI voices",
              audioUrl: `/uploads/${audioFileName}`,
              duration,
              type: "tts",
            })
            .returning();

          return newPodcast;
        });

        res.json({ message: "Podcast created successfully" });
      } catch (error) {
        await logger.error(`Error generating audio: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await logger.error(`Error processing podcast: ${errorMessage}`);
      
      const isValidationError = error instanceof Error && error.message.includes("Please upload");
      res.status(isValidationError ? 400 : 500)
         .json({
           error: errorMessage,
           type: isValidationError ? "validation" : "server"
         });
    } finally {
      if (file?.path) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          const cleanupError = unlinkError instanceof Error ? unlinkError.message : 'Unknown error';
          await logger.error(`Error cleaning up uploaded file: ${cleanupError}`);
        }
      }
    }
  });

  // Usage check endpoint
  app.get("/api/user/usage/check", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const currentMonth = new Date().toISOString().slice(0, 7);
      let [usage] = await db
        .select()
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, req.user.id),
            eq(userUsage.monthYear, currentMonth)
          )
        )
        .limit(1);

      if (!usage) {
        [usage] = await db
          .insert(userUsage)
          .values({
            userId: req.user.id,
            articlesConverted: 0,
            tokensUsed: 0,
            monthYear: currentMonth,
          })
          .returning();
      }

      const hasReachedLimit = (
        (usage.articlesConverted ?? 0) >= ARTICLE_LIMIT || 
        (usage.tokensUsed ?? 0) >= TOKEN_LIMIT
      );

      const remainingArticles = Math.max(0, ARTICLE_LIMIT - (usage.articlesConverted ?? 0));
      const remainingTokens = Math.max(0, TOKEN_LIMIT - (usage.tokensUsed ?? 0));

      res.json({
        hasReachedLimit,
        limits: {
          articles: {
            used: usage.articlesConverted || 0,
            limit: ARTICLE_LIMIT,
            remaining: remainingArticles
          },
          tokens: {
            used: usage.tokensUsed || 0,
            limit: TOKEN_LIMIT,
            remaining: remainingTokens
          }
        },
        currentPeriod: {
          month: currentMonth,
          resetsOn: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
        },
        upgradePlans: {
          monthly: {
            name: "Pro",
            price: 9.99,
            features: [
              "Unlimited articles",
              "200,000 tokens per month",
              "Priority support"
            ]
          },
          annual: {
            name: "Pro Annual",
            price: 99.99,
            features: [
              "Unlimited articles",
              "300,000 tokens per month",
              "Priority support",
              "2 months free"
            ]
          }
        }
      });
    } catch (error) {
      await logger.error([
        'Error checking usage limits:',
        error instanceof Error ? error.message : String(error)
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
      if (!req.user) return res.status(401).send("Not authenticated");

      const [podcast] = await db
        .delete(podcasts)
        .where(
          and(
            eq(podcasts.id, parseInt(req.params.id)),
            eq(podcasts.userId, req.user.id),
          ),
        )
        .returning();

      if (!podcast) {
        return res.status(404).send("Podcast not found or unauthorized");
      }

      if (podcast.audioUrl) {
        const filePath = path.join(".", podcast.audioUrl);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.error("Error deleting audio file:", error);
        }
      }

      res.json({ message: "Podcast deleted successfully" });
    } catch (error) {
      console.error("Delete podcast error:", error);
      res.status(500).send("Failed to delete podcast");
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
    console.log('Client connected to SSE endpoint');
    
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    // Send initial progress
    res.write(`data: ${JSON.stringify({ progress: 0 })}\n\n`);

    const sendProgress = (progress: number) => {
      console.log('Sending progress update:', progress);
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    };

    // Add this client to TTSService progress listeners
    ttsService.addProgressListener(sendProgress);

    // Remove listener when client disconnects
    req.on("close", () => {
      console.log('Client disconnected from SSE endpoint');
      ttsService.removeProgressListener(sendProgress);
    });
  });

  // Text-to-speech conversion
  // Calculate pricing estimate
  app.post("/api/podcast/pricing", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const { text } = req.body;
      if (!text) {
        return res.status(400).send("Text content is required");
      }

      const pricingDetails = await ttsService.calculatePricing(text);
      res.json(pricingDetails);
    } catch (error) {
      console.error("Pricing calculation error:", error);
      res.status(500).send("Failed to calculate pricing");
    }
  });

  // Get user usage stats
  app.get("/api/user/usage", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const [usage] = await db
        .select()
        .from(userUsage)
        .where(eq(userUsage.userId, req.user.id))
        .limit(1);

      if (!usage) {
        // Create initial usage record if it doesn't exist
        const [newUsage] = await db
          .insert(userUsage)
          .values({
            userId: req.user.id,
            articlesConverted: 0,
            tokensUsed: 0,
          })
          .returning();
        return res.json(newUsage);
      }

      res.json(usage);
    } catch (error) {
      console.error("Error fetching user usage:", error);
      res.status(500).send("Failed to fetch usage stats");
    }
  });
  return app;
}