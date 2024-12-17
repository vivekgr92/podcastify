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
import { podcasts, playlists, playlistItems, progress } from "@db/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { eq, and } from "drizzle-orm";
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
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const filePath = path.join(__dirname, '..', 'uploads', sanitizedFilename);

    try {
      // Check if file exists
      if (!fsSync.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        res.status(404).send('File not found');
        return;
      }

      const stat = await fs.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Determine content type based on file extension
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.mp3' ? 'audio/mpeg' :
                         ext === '.wav' ? 'audio/wav' :
                         ext === '.ogg' ? 'audio/ogg' :
                         ext === '.m4a' ? 'audio/mp4' :
                         'application/octet-stream';

      // Handle range requests for audio streaming
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Validate range request
        if (isNaN(start) || isNaN(end) || start >= fileSize || start > end || end >= fileSize) {
          res.status(416).header({
            'Content-Range': `bytes */${fileSize}`
          }).send('Requested range not satisfiable');
          return;
        }

        // Limit chunk size to prevent memory issues
        const maxChunkSize = 1024 * 1024; // 1MB
        if ((end - start) > maxChunkSize) {
          end = start + maxChunkSize - 1;
        }

        const chunksize = (end - start) + 1;
        const file = fsSync.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        };

        res.writeHead(206, head);
        file.pipe(res);

        // Handle stream errors
        file.on('error', (error) => {
          console.error('Error streaming file:', error);
          if (!res.headersSent) {
            res.status(500).send('Error streaming file');
          }
          file.destroy();
        });
      } else {
        // Send entire file
        const head = {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        };
        res.writeHead(200, head);
        const file = fsSync.createReadStream(filePath);
        file.pipe(res);

        // Handle stream errors
        file.on('error', (error) => {
          console.error('Error streaming file:', error);
          if (!res.headersSent) {
            res.status(500).send('Error streaming file');
          }
          file.destroy();
        });
      }
    } catch (error) {
      console.error('Error streaming audio:', error);
      if (!res.headersSent) {
        res.status(500).send('Error streaming audio file');
      }
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

  app.post("/api/podcast", upload.single("file"), async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");

      const file = req.file;
      if (!file) {
        return res.status(400).send("No file uploaded");
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

        console.log("Processed file content sample:", fileContent.substring(0, 200) + "...");
      } catch (error) {
        console.error("Error reading file:", error);
        return res.status(400).send("Unable to process file. Please ensure it's a valid PDF or text file.");
      }

      // Generate audio using TTS service
      const { audioBuffer, duration } =
        await ttsService.generateConversation(fileContent);

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
  });
}
