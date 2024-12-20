import { z } from "zod";

export const PodcastSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  audioUrl: z.string(),
  coverImage: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]).transform(val => 
    typeof val === 'string' ? val : val.toISOString()
  ),
  updatedAt: z.union([z.string(), z.date(), z.null()]).optional()
    .transform(val => 
      val ? (typeof val === 'string' ? val : val.toISOString()) : undefined
    ),
  type: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  userId: z.number().nullable().optional()
});

export type Podcast = z.infer<typeof PodcastSchema>;