-- Migration 011: Add bank details and online payment fields to store_details
-- Add bank details columns to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(255);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(11);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS branch VARCHAR(255);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN DEFAULT false;

-- Update existing records to set online_payment_enabled to false
UPDATE store_details SET online_payment_enabled = false WHERE online_payment_enabled IS NULL;

