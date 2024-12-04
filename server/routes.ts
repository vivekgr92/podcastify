import type { Express } from "express";
import { setupAuth } from "./auth";
import { db } from "../db";
import multer from "multer";
import path from "path";
import { podcasts, playlists, playlistItems, progress } from "@db/schema";
import { eq, and } from "drizzle-orm";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

export function registerRoutes(app: Express) {
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
  app.post("/api/tts", async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      // In a real implementation, this would call a TTS service
      // For now, we'll return a mock response
      const mockAudioUrl = "/uploads/tts-" + Date.now() + ".mp3";
      
      const [newPodcast] = await db.insert(podcasts)
        .values({
          userId: req.user.id,
          title: "TTS: " + req.body.title,
          description: "Generated from text",
          audioUrl: mockAudioUrl,
          type: 'tts'
        })
        .returning();

      res.json(newPodcast);
    } catch (error) {
      res.status(500).send("Failed to convert text to speech");
    }
  });
}
