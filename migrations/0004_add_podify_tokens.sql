ALTER TABLE "user_usage" ADD COLUMN IF NOT EXISTS "podify_tokens" DECIMAL DEFAULT 0;

-- Update existing records to set podify_tokens based on tokens_used
UPDATE "user_usage"
SET "podify_tokens" = CEIL(CAST("tokens_used" AS DECIMAL) / 100)
WHERE "podify_tokens" IS NULL OR "podify_tokens" = 0;
