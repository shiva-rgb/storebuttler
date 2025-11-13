-- Combined Migration File for Render Deployment
-- Run this file to set up all database tables and schema

-- ============================================
-- Migration 001: Create base tables
-- ============================================
-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    unit VARCHAR(50),
    category VARCHAR(100),
    description TEXT,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(255) PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_address TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(255) REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    product_name VARCHAR(255),
    product_price DECIMAL(10, 2),
    CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Create store_details table (single row table)
CREATE TABLE IF NOT EXISTS store_details (
    id SERIAL PRIMARY KEY,
    store_name VARCHAR(255) NOT NULL,
    contact_number_1 VARCHAR(50) NOT NULL,
    contact_number_2 VARCHAR(50),
    address TEXT NOT NULL,
    gstin VARCHAR(15),
    upi_id VARCHAR(255) NOT NULL,
    instructions TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ============================================
-- Migration 003: Add store references
-- ============================================
-- Add store_name column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);

-- Add store_name column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_store_name ON products(store_name);
CREATE INDEX IF NOT EXISTS idx_orders_store_name ON orders(store_name);

-- ============================================
-- Migration 005: Add email to store_details
-- ============================================
-- Add email column to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- ============================================
-- Migration 006: Create users table
-- ============================================
-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    reset_token VARCHAR(255) NULL,
    reset_token_expiry TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- ============================================
-- Migration 007: Add user references
-- ============================================
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

-- ============================================
-- Migration 008: Add is_live to store_details
-- ============================================
-- Add is_live column to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;

-- Update existing records to be live by default (optional)
UPDATE store_details SET is_live = false WHERE is_live IS NULL;

-- Make upi_id optional (since it's disabled in the app)
ALTER TABLE store_details ALTER COLUMN upi_id DROP NOT NULL;

