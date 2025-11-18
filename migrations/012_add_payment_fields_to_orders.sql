-- Migration 012: Add payment fields to orders table for Razorpay integration
-- Add payment method, status, and Razorpay details columns to orders table

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

-- Update existing orders to have default payment method and status
UPDATE orders SET payment_method = 'cod', payment_status = 'paid' WHERE payment_method IS NULL;

