-- Add is_live column to store_details table
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT false;

-- Update existing records to be live by default (optional)
UPDATE store_details SET is_live = false WHERE is_live IS NULL;

