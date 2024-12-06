import type { Express } from "express";
import express from "express";
import { setupAuth } from "./auth";
import { db } from "../db";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { podcasts, playlists, playlistItems, progress } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { ttsService } from "./services/tts";

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
  // Serve static files from uploads directory
  app.use("/uploads", express.static("uploads"));

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

  // Text-to-speech conversion
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
        if (file.mimetype === 'application/pdf') {
          const pdfParse = require('pdf-parse');
          const pdfBuffer = await fs.readFile(file.path);
          const pdfData = await pdfParse(pdfBuffer);
          fileContent = pdfData.text;
        } else if (file.mimetype === 'text/plain') {
          fileContent = await fs.readFile(file.path, "utf-8");
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
