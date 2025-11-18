# Simple Instructions: Update Render Database

## Step 1: Open Render Database Terminal

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click on your **PostgreSQL database**
3. Click **"Connect"** button
4. Click **"psql"** (this opens a web terminal)

## Step 2: Run These SQL Commands

Copy and paste each block one at a time, press Enter after each:

### Migration 1: Add Payment Fields to Orders
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
UPDATE orders SET payment_method = 'cod', payment_status = 'paid' WHERE payment_method IS NULL;
```

### Migration 2: Add Razorpay Keys
```sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_id VARCHAR(255);
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;
```

### Migration 3: Remove Old Bank Details Columns
```sql
ALTER TABLE store_details DROP COLUMN IF EXISTS upi_id;
ALTER TABLE store_details DROP COLUMN IF EXISTS account_holder_name;
ALTER TABLE store_details DROP COLUMN IF EXISTS account_number;
ALTER TABLE store_details DROP COLUMN IF EXISTS ifsc_code;
ALTER TABLE store_details DROP COLUMN IF EXISTS branch;
```

### Migration 4: Remove GSTIN
```sql
ALTER TABLE store_details DROP COLUMN IF EXISTS gstin;
```

### Migration 5: Add Minimum Order Value
```sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS minimum_order_value DECIMAL(10, 2);
```

## Done!

That's it. All migrations are complete. The database is now updated.

