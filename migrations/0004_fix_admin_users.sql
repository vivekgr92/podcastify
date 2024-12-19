-- Fix admin users by setting is_admin to true for @admin.com emails
UPDATE users 
SET is_admin = true 
WHERE email LIKE '%@admin.com';
