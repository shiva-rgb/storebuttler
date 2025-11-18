-- Migration 014: Remove unused bank details columns from store_details table
-- These columns were from the old bank details implementation and are no longer needed
-- We now use Razorpay API keys directly instead

ALTER TABLE store_details DROP COLUMN IF EXISTS upi_id;
ALTER TABLE store_details DROP COLUMN IF EXISTS account_holder_name;
ALTER TABLE store_details DROP COLUMN IF EXISTS account_number;
ALTER TABLE store_details DROP COLUMN IF EXISTS ifsc_code;
ALTER TABLE store_details DROP COLUMN IF EXISTS branch;

