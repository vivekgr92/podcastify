import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").unique().notNull(),
  displayName: text("display_name").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const podcasts = pgTable("podcasts", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow(),
  type: text("type").default("upload"), // 'upload' or 'tts'
});

export const playlists = pgTable("playlists", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const playlistItems = pgTable("playlist_items", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  playlistId: integer("playlist_id").references(() => playlists.id),
  podcastId: integer("podcast_id").references(() => podcasts.id),
  position: integer("position").notNull(),
});

export const progress = pgTable("progress", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  podcastId: integer("podcast_id").references(() => podcasts.id),
  position: integer("position").default(0),
  completed: boolean("completed").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = z.infer<typeof selectUserSchema>;

export const insertPodcastSchema = createInsertSchema(podcasts);
export const selectPodcastSchema = createSelectSchema(podcasts);
export type InsertPodcast = z.infer<typeof insertPodcastSchema>;
export type Podcast = z.infer<typeof selectPodcastSchema>;

export const insertPlaylistSchema = createInsertSchema(playlists);
export const selectPlaylistSchema = createSelectSchema(playlists);
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type Playlist = z.infer<typeof selectPlaylistSchema>;

export const insertProgressSchema = createInsertSchema(progress);
export const selectProgressSchema = createSelectSchema(progress);
export type InsertProgress = z.infer<typeof insertProgressSchema>;
export type Progress = z.infer<typeof selectProgressSchema>;
