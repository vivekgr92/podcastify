CREATE TABLE IF NOT EXISTS "new_user_usage" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer REFERENCES "users"("id"),
  "articles_converted" integer DEFAULT 0,
  "tokens_used" integer DEFAULT 0,
  "last_conversion" timestamp DEFAULT now(),
  "month_year" text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  CONSTRAINT "user_usage_user_id_month_year_unique" UNIQUE("user_id", "month_year")
);

INSERT INTO "new_user_usage" ("user_id", "articles_converted", "tokens_used", "last_conversion", "month_year")
SELECT "user_id", "articles_converted", "tokens_used", "last_conversion", to_char(CURRENT_DATE, 'YYYY-MM')
FROM "user_usage";

DROP TABLE "user_usage";
ALTER TABLE "new_user_usage" RENAME TO "user_usage";
