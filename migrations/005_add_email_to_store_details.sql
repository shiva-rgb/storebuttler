-- Add email column to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS email VARCHAR(255);

