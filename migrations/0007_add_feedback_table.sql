CREATE TABLE IF NOT EXISTS "feedback" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer REFERENCES "users"("id"),
  "content" text NOT NULL,
  "rating" integer CHECK (rating >= 1 AND rating <= 5),
  "created_at" timestamp DEFAULT now(),
  "status" text DEFAULT 'pending'
);

-- Add index for faster user-based queries
CREATE INDEX IF NOT EXISTS "feedback_user_id_idx" ON "feedback" ("user_id");
