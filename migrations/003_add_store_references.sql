-- Add store_name column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);

-- Add store_name column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_store_name ON products(store_name);
CREATE INDEX IF NOT EXISTS idx_orders_store_name ON orders(store_name);

-- Update existing records to link them to the current store (if store_details exists)
-- This will set store_name for existing products/orders based on the store_name in store_details
UPDATE products 
SET store_name = (SELECT store_name FROM store_details LIMIT 1)
WHERE store_name IS NULL 
AND EXISTS (SELECT 1 FROM store_details);

UPDATE orders 
SET store_name = (SELECT store_name FROM store_details LIMIT 1)
WHERE store_name IS NULL 
AND EXISTS (SELECT 1 FROM store_details);

