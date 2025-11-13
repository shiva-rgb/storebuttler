-- Fix orders with empty store_name
-- This script updates any orders that have NULL or empty store_name
-- by setting them to the store_name from store_details

UPDATE orders 
SET store_name = (SELECT store_name FROM store_details ORDER BY id LIMIT 1)
WHERE (store_name IS NULL OR store_name = '')
AND EXISTS (SELECT 1 FROM store_details WHERE store_name IS NOT NULL AND store_name != '');

-- Show how many orders were updated
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % order(s) with empty store_name', updated_count;
END $$;

