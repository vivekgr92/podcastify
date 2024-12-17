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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { eq, and, sql } from "drizzle-orm";
import { ttsService } from "./services/tts";
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const dir = "./uploads";
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch((err) => cb(err, dir));
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

export function registerRoutes(app: Express) {
  // Serve static files from uploads directory with proper audio streaming support
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

  // Set up authentication routes
  setupAuth(app);

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

      // Only allow users to delete their own podcasts
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

      // Delete the audio file if it exists
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

  // Upload new podcast
  app.post(
    "/api/podcasts",
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "cover", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        if (!req.user) return res.status(401).send("Not authenticated");

        const files = req.files as {
          [fieldname: string]: Express.Multer.File[];
        };
        const audioFile = files["audio"]?.[0];
        const coverFile = files["cover"]?.[0];

        const [newPodcast] = await db
          .insert(podcasts)
          .values({
            userId: req.user.id,
            title: req.body.title,
            description: req.body.description,
            audioUrl: audioFile ? `/uploads/${audioFile.filename}` : "",
            coverImage: coverFile ? `/uploads/${coverFile.filename}` : "",
            type: "upload",
          })
          .returning();

        res.json(newPodcast);
      } catch (error) {
        res.status(500).send("Failed to create podcast");
      }
    },
  );

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

// Check if user has reached usage limits
app.get("/api/user/usage/check", async (req, res) => {
  try {
    if (!req.user) return res.status(401).send("Not authenticated");

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

    // Get or create usage record for current month
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
      // Create initial usage record for current month if it doesn't exist
      const [newUsage] = await db
        .insert(userUsage)
        .values({
          userId: req.user.id,
          articlesConverted: 0,
          tokensUsed: 0,
          monthYear: currentMonth,
        })
        .returning();
      usage = newUsage;
    }

    const ARTICLE_LIMIT = 3;
    const TOKEN_LIMIT = 50000;

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
      }
    });
  } catch (error) {
    console.error("Error checking usage limits:", error);
    res.status(500).send("Failed to check usage limits");
  }
});

app.post("/api/podcast", upload.single("file"), async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const file = req.file;
      if (!file) {
        return res.status(400).send("No file uploaded");
      }

      // Get or create usage record for current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
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

      // Check usage limits before processing
      const ARTICLE_LIMIT = 3;
      const TOKEN_LIMIT = 50000;

      if ((usage.articlesConverted ?? 0) >= ARTICLE_LIMIT || (usage.tokensUsed ?? 0) >= TOKEN_LIMIT) {
        return res.status(403).json({
          error: "Usage limit reached",
          limits: {
            articles: {
              used: usage.articlesConverted ?? 0,
              limit: ARTICLE_LIMIT
            },
            tokens: {
              used: usage.tokensUsed ?? 0,
              limit: TOKEN_LIMIT
            }
          }
        });
      }

      // Validate file type and read content
      let fileContent;
      try {
        const fileBuffer = await fs.readFile(file.path);
        
        if (file.mimetype === 'application/pdf') {
          try {
            const pdfData = await pdfParse(fileBuffer);
            fileContent = pdfData.text;
          } catch (pdfError) {
            console.error("PDF parsing error:", pdfError);
            return res.status(400).send("Unable to parse PDF file. Please ensure it's a valid PDF.");
          }
        } else if (file.mimetype === 'text/plain') {
          fileContent = fileBuffer.toString('utf-8');
        } else {
          return res.status(400).send("Please upload a PDF or text file");
        }
        
        // Basic validation of text content
        if (!fileContent || typeof fileContent !== 'string' || fileContent.length === 0) {
          throw new Error('Invalid file content');
        }

        // Remove any non-printable characters and normalize whitespace
        fileContent = fileContent
          .replace(/[^\x20-\x7E\n\r\t]/g, '') // Keep only printable ASCII chars and basic whitespace
          .replace(/\s+/g, ' ')
          .trim();

        // Calculate estimated tokens (1 token ≈ 4 characters)
        const estimatedTokens = Math.ceil(fileContent.length / 4);
        
        // Check if this conversion would exceed the token limit
        if ((usage.tokensUsed ?? 0) + estimatedTokens > TOKEN_LIMIT) {
          return res.status(403).json({
            error: "Token limit would be exceeded",
            limits: {
              articles: {
                used: usage.articlesConverted ?? 0,
                limit: ARTICLE_LIMIT
              },
              tokens: {
                used: usage.tokensUsed ?? 0,
                limit: TOKEN_LIMIT,
                estimated: estimatedTokens
              }
            }
          });
        }

        console.log("Processed file content sample:", fileContent.substring(0, 200) + "...");

      const { audioBuffer, duration } = await ttsService.generateConversation(fileContent);
      const tokensUsed = Math.ceil(fileContent.length / 4); // Estimate tokens based on character count

      // Update usage statistics for the current month
      await db
        .insert(userUsage)
        .values({
          userId: req.user.id,
          articlesConverted: 1,
          tokensUsed: tokensUsed,
          monthYear: currentMonth,
        })
        .onConflictDoUpdate({
          target: [userUsage.userId, userUsage.monthYear],
          set: {
            articlesConverted: sql`${userUsage.articlesConverted} + 1`,
            tokensUsed: sql`${userUsage.tokensUsed} + ${tokensUsed}`,
            lastConversion: new Date(),
          },
        });

      // Save the audio file
      const audioFileName = `${Date.now()}-${file.originalname}.mp3`;
      const audioPath = path.join("./uploads", audioFileName);
      await fs.writeFile(audioPath, audioBuffer);

      // Create podcast entry
      const [newPodcast] = await db
        .insert(podcasts)
        .values({
          userId: req.user.id,
          title: file.originalname.replace(/\.[^/.]+$/, ""),
          description: "Generated from uploaded document using AI voices",
          audioUrl: `/uploads/${audioFileName}`,
          duration,
          type: "tts",
        })
        .returning();

      res.json(newPodcast);
    } catch (error) {
      console.error("Podcast generation error:", error);
      res.status(500).send("Failed to generate podcast");
    }
  } catch (error) {
    console.error("File processing error:", error);
    res.status(500).send("Failed to process file");
  }
});
}
