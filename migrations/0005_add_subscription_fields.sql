ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS "subscription_id" text,
ADD COLUMN IF NOT EXISTS "current_period_end" timestamp;
