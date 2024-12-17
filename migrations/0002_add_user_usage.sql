CREATE TABLE IF NOT EXISTS "user_usage" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer REFERENCES "users"("id"),
  "articles_converted" integer DEFAULT 0,
  "tokens_used" integer DEFAULT 0,
  "last_conversion" timestamp DEFAULT now(),
  CONSTRAINT "user_usage_user_id_unique" UNIQUE("user_id")
);
