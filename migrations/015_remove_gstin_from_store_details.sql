-- Migration 015: Remove GSTIN column from store_details table
-- GSTIN field is no longer needed

ALTER TABLE store_details DROP COLUMN IF EXISTS gstin;

