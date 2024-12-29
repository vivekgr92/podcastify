import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, boolean, uniqueIndex, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  displayName: text("display_name").notNull(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  subscriptionStatus: text("subscription_status").default('free'),
  subscriptionId: text("subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
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

export const userUsage = pgTable("user_usage", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  articlesConverted: integer("articles_converted").default(0),
  tokensUsed: integer("tokens_used").default(0),
  podifyTokens: decimal("podify_tokens").default('0'),
  lastConversion: timestamp("last_conversion").defaultNow(),
  monthYear: text("month_year").notNull().default(sql`to_char(CURRENT_DATE, 'YYYY-MM')`),
}, (table) => ({
  unq: uniqueIndex('user_usage_user_id_month_year_unique').on(table.userId, table.monthYear)
}));

export const insertUserUsageSchema = createInsertSchema(userUsage);
export const selectUserUsageSchema = createSelectSchema(userUsage);
export type InsertUserUsage = z.infer<typeof insertUserUsageSchema>;
export type UserUsage = z.infer<typeof selectUserUsageSchema>;