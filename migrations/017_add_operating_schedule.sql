-- Migration 017: Add operating schedule to store_details table
-- Allows store owners to set weekly operating hours

ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_enabled BOOLEAN DEFAULT false;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_days JSONB;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_start_time TIME;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_end_time TIME;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';

