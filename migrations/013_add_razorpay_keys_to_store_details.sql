-- Migration 013: Add Razorpay API keys to store_details table
-- Add Razorpay key_id and encrypted key_secret fields for store-specific payment processing
-- Note: online_payment_enabled was already added in migration 011

ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_id VARCHAR(255);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;

