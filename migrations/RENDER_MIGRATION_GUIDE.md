# Running Migrations on Render Database

This guide helps you run the necessary database migrations on your Render PostgreSQL database.

## Quick Migration Script

If you have access to the database via `psql`, you can run all migrations at once:

```bash
# Connect to Render database (use External Database URL from Render dashboard)
psql "postgresql://user:password@host:port/database"

# Then run each migration
\i migrations/012_add_payment_fields_to_orders.sql
\i migrations/013_add_razorpay_keys_to_store_details.sql
\i migrations/014_remove_unused_bank_details_columns.sql
\i migrations/015_remove_gstin_from_store_details.sql
\i migrations/016_add_minimum_order_value.sql
```

## Using Render's Web-Based psql

1. Go to your PostgreSQL database on Render
2. Click **"Connect"** → **"psql"**
3. Copy and paste the SQL from each migration file

## Migration Files to Run (in order)

### 1. Migration 012: Add Payment Fields to Orders
```sql
-- File: migrations/012_add_payment_fields_to_orders.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255);
```

### 2. Migration 013: Add Razorpay Keys
```sql
-- File: migrations/013_add_razorpay_keys_to_store_details.sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_id VARCHAR(255);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;
```

### 3. Migration 014: Remove Unused Bank Details
```sql
-- File: migrations/014_remove_unused_bank_details_columns.sql
ALTER TABLE store_details DROP COLUMN IF EXISTS account_holder_name;
ALTER TABLE store_details DROP COLUMN IF EXISTS account_number;
ALTER TABLE store_details DROP COLUMN IF EXISTS ifsc_code;
ALTER TABLE store_details DROP COLUMN IF EXISTS branch;
ALTER TABLE store_details DROP COLUMN IF EXISTS upi_id;
```

### 4. Migration 015: Remove GSTIN
```sql
-- File: migrations/015_remove_gstin_from_store_details.sql
ALTER TABLE store_details DROP COLUMN IF EXISTS gstin;
```

### 5. Migration 016: Add Minimum Order Value
```sql
-- File: migrations/016_add_minimum_order_value.sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS minimum_order_value DECIMAL(10, 2);
```

## Verify Migrations

After running migrations, verify the changes:

```sql
-- Check orders table
\d orders

-- Check store_details table
\d store_details
```

You should see:
- `orders` table has: `payment_method`, `payment_status`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`
- `store_details` table has: `razorpay_key_id`, `razorpay_key_secret`, `minimum_order_value`
- `store_details` table does NOT have: `account_holder_name`, `account_number`, `ifsc_code`, `branch`, `upi_id`, `gstin`

## Troubleshooting

### "Column already exists" errors
- These are safe to ignore if using `IF NOT EXISTS`
- The migration will skip columns that already exist

### "Column does not exist" errors (for DROP statements)
- These are safe to ignore if using `IF EXISTS`
- The migration will skip columns that don't exist

### Connection issues
- Ensure you're using the correct database URL
- Check that the database is running on Render
- Verify credentials are correct

