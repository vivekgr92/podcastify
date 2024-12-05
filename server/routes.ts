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
  app.post("/api/tts", upload.single('file'), async (req, res) => {
    try {
      if (!req.user) return res.status(401).send("Not authenticated");
      
      const file = req.file;
      if (!file) {
        return res.status(400).send("No file uploaded");
      }
      
      // Mock API response - in real implementation this would call an external TTS service
      const mockResponse = {
        audioUrl: `/uploads/${file.filename}`,
        title: file.originalname.replace(/\.[^/.]+$/, ""),
        description: "Converted from uploaded document",
        duration: 180 // mock duration in seconds
      };
      
      const [newPodcast] = await db.insert(podcasts)
        .values({
          userId: req.user.id,
          title: mockResponse.title,
          description: mockResponse.description,
          audioUrl: mockResponse.audioUrl,
          duration: mockResponse.duration,
          type: 'tts'
        })
        .returning();

      res.json(newPodcast);
    } catch (error) {
      res.status(500).send("Failed to convert text to speech");
    }
  });
}
