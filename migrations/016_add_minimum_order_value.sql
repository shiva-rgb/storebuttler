-- Migration 016: Add minimum_order_value to store_details table
-- This field allows store owners to set a minimum order value requirement

ALTER TABLE store_details ADD COLUMN IF NOT EXISTS minimum_order_value DECIMAL(10, 2);

