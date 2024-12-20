import { z } from "zod";

export const PodcastSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  audioUrl: z.string(),
  coverImage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Podcast = z.infer<typeof PodcastSchema>;
