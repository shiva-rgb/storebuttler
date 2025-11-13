-- Delete all existing data to start fresh
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM products;
DELETE FROM store_details;

-- Add user_id foreign key to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id foreign key to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id foreign key to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_store_details_user_id ON store_details(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Remove store_name column from products table (replaced by user_id)
ALTER TABLE products DROP COLUMN IF EXISTS store_name;

-- Remove store_name column from orders table (replaced by user_id)
ALTER TABLE orders DROP COLUMN IF EXISTS store_name;

