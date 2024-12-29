-- Add subscriptionType column to users table
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "subscription_type" text DEFAULT 'free';

-- Update existing users to have a default subscription type
UPDATE "users" 
SET subscription_type = CASE 
    WHEN subscription_status IN ('canceled', 'inactive', 'free', 'payment_failed', NULL) THEN 'free'
    WHEN subscription_status LIKE '%Basic Plan%' THEN 'Basic Plan'
    WHEN subscription_status LIKE '%Pro Plan%' THEN 'Pro Plan'
    WHEN subscription_status LIKE '%Enterprise Plan%' THEN 'Enterprise Plan'
    ELSE 'free'
END
WHERE subscription_type IS NULL;