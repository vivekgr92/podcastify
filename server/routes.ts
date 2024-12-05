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
      .catch(err => cb(err, dir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

export function registerRoutes(app: Express) {
  // Serve static files from uploads directory
  app.use('/uploads', express.static('uploads'));

  // Delete podcast
  app.delete("/api/podcasts/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const podcastId = parseInt(req.params.id);
      const [podcast] = await db.select()
        .from(podcasts)
        .where(eq(podcasts.id, podcastId))
        .limit(1);

      if (!podcast) {
        return res.status(404).send("Podcast not found");
      }

      if (podcast.userId !== req.user.id) {
        return res.status(403).send("Not authorized to delete this podcast");
      }

      // Delete the podcast
      await db.delete(podcasts)
        .where(eq(podcasts.id, podcastId));

      res.json({ message: "Podcast deleted successfully" });
    } catch (error) {
      console.error('Delete podcast error:', error);
      res.status(500).send("Failed to delete podcast");
    }
  });
  
  // Set up authentication routes
  setupAuth(app);

  // Get user's podcasts
  app.get("/api/podcasts", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const userPodcasts = await db.select()
        .from(podcasts)
        .where(eq(podcasts.userId, req.user.id));
      
      res.json(userPodcasts);
    } catch (error) {
      res.status(500).send("Failed to fetch podcasts");
    }
  });

  // Upload new podcast
  app.post("/api/podcasts", upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]), async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const audioFile = files['audio']?.[0];
      const coverFile = files['cover']?.[0];

      const [newPodcast] = await db.insert(podcasts)
        .values({
          userId: req.user.id,
          title: req.body.title,
          description: req.body.description,
          audioUrl: audioFile ? `/uploads/${audioFile.filename}` : '',
          coverImage: coverFile ? `/uploads/${coverFile.filename}` : '',
          type: 'upload'
        })
        .returning();

      res.json(newPodcast);
    } catch (error) {
      res.status(500).send("Failed to create podcast");
    }
  });

  // Get user's playlists
  app.get("/api/playlists", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const userPlaylists = await db.select()
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
      
      const [newPlaylist] = await db.insert(playlists)
        .values({
          userId: req.user.id,
          title: req.body.title,
          description: req.body.description,
          coverImage: req.body.coverImage
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
      
      const [newItem] = await db.insert(playlistItems)
        .values({
          playlistId: parseInt(req.params.playlistId),
          podcastId: req.body.podcastId,
          position: req.body.position
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
          completed: req.body.completed
        })
        .onConflictDoUpdate({
          target: [progress.userId, progress.podcastId],
          set: {
            position: req.body.position,
            completed: req.body.completed,
            updatedAt: new Date()
          }
        })
        .returning();

      res.json(updatedProgress);
    } catch (error) {
      res.status(500).send("Failed to update progress");
    }
  });

  // Text-to-speech conversion
  app.post("/api/podcast", upload.single('file'), async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const file = req.file;
      if (!file) {
        return res.status(400).send("No file uploaded");
      }

      // Read the file content
      const fileContent = await fs.readFile(file.path, 'utf-8');
      
      // Generate audio using TTS service
      const { audioBuffer, duration } = await ttsService.generateConversation(fileContent);
      
      // Save the audio file
      const audioFileName = `${Date.now()}-${file.originalname}.mp3`;
      const audioPath = path.join('./uploads', audioFileName);
      await fs.writeFile(audioPath, audioBuffer);
      
      // Create podcast entry
      const [newPodcast] = await db.insert(podcasts)
        .values({
          userId: req.user.id,
          title: file.originalname.replace(/\.[^/.]+$/, ""),
          description: "Generated from uploaded document using AI voices",
          audioUrl: `/uploads/${audioFileName}`,
          duration,
          type: 'tts'
        })
        .returning();

      res.json(newPodcast);
    } catch (error) {
      console.error('Podcast generation error:', error);
      res.status(500).send("Failed to generate podcast");
    }
  });
}
