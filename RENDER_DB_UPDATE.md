# Simple Instructions: Update Render Database

## Method 1: Using External Database URL (Recommended)

If you have the external database URL, use this method:

1. **Get External Database URL:**
   - Go to Render Dashboard → Your PostgreSQL database → Connect
   - Copy the **"External Database URL"**

2. **Run from your computer:**
   ```bash
   # Navigate to your project folder
   cd D:\supermartweb
   
   # Run each migration (replace YOUR_URL with your actual URL)
   # IMPORTANT: Run 011 first if you get "online_payment_enabled does not exist" error
   psql "YOUR_EXTERNAL_URL" -f migrations/011_add_online_payment_enabled.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/012_add_payment_fields_to_orders.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/013_add_razorpay_keys_to_store_details.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/014_remove_unused_bank_details_columns.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/015_remove_gstin_from_store_details.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/016_add_minimum_order_value.sql
   psql "YOUR_EXTERNAL_URL" -f migrations/017_add_operating_schedule.sql
   ```

   **OR connect manually:**
   ```bash
   psql "YOUR_EXTERNAL_URL"
   ```
   Then copy-paste the SQL blocks below.

## Method 2: Using Render Web Terminal

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click on your **PostgreSQL database**
3. Click **"Connect"** button
4. Click **"psql"** (this opens a web terminal)

## Step 2: Run These SQL Commands

Copy and paste each block one at a time, press Enter after each:

### Migration 0: Add Online Payment Enabled (Run this first if you get "online_payment_enabled does not exist" error)
```sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN DEFAULT false;
UPDATE store_details SET online_payment_enabled = false WHERE online_payment_enabled IS NULL;
```

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

### Migration 6: Add Operating Schedule
```sql
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_enabled BOOLEAN DEFAULT false;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_days JSONB;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_start_time TIME;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_end_time TIME;
ALTER TABLE store_details ADD COLUMN IF NOT EXISTS operating_schedule_timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';
```

## Done!

That's it. All migrations are complete. The database is now updated.

