-- Migration 011: Add online_payment_enabled to store_details table
-- This column controls whether online payments are enabled for the store

ALTER TABLE store_details ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN DEFAULT false;

-- Update existing records to set online_payment_enabled to false
UPDATE store_details SET online_payment_enabled = false WHERE online_payment_enabled IS NULL;

