# Update Render Database Using External URL

## Step 1: Get Your External Database URL

From Render Dashboard:
1. Go to your PostgreSQL database
2. Click on **"Connect"**
3. Copy the **"External Database URL"** 
   - It looks like: `postgresql://user:password@host:port/database`

## Step 2: Run Migrations from Your Computer

Open PowerShell (Windows) or Terminal (Mac/Linux) and run:

### Option A: Run All Migrations at Once

```bash
# Replace YOUR_EXTERNAL_URL with your actual URL
psql "YOUR_EXTERNAL_URL" -f migrations/012_add_payment_fields_to_orders.sql
psql "YOUR_EXTERNAL_URL" -f migrations/013_add_razorpay_keys_to_store_details.sql
psql "YOUR_EXTERNAL_URL" -f migrations/014_remove_unused_bank_details_columns.sql
psql "YOUR_EXTERNAL_URL" -f migrations/015_remove_gstin_from_store_details.sql
psql "YOUR_EXTERNAL_URL" -f migrations/016_add_minimum_order_value.sql
```

### Option B: Connect and Run Manually

1. **Connect to database:**
   ```bash
   psql "YOUR_EXTERNAL_URL"
   ```

2. **Then copy-paste each SQL block:**

   **Migration 1:**
   ```sql
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cod';
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(255);
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255);
   ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
   UPDATE orders SET payment_method = 'cod', payment_status = 'paid' WHERE payment_method IS NULL;
   ```

   **Migration 2:**
   ```sql
   ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_id VARCHAR(255);
   ALTER TABLE store_details ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;
   ```

   **Migration 3:**
   ```sql
   ALTER TABLE store_details DROP COLUMN IF EXISTS upi_id;
   ALTER TABLE store_details DROP COLUMN IF EXISTS account_holder_name;
   ALTER TABLE store_details DROP COLUMN IF EXISTS account_number;
   ALTER TABLE store_details DROP COLUMN IF EXISTS ifsc_code;
   ALTER TABLE store_details DROP COLUMN IF EXISTS branch;
   ```

   **Migration 4:**
   ```sql
   ALTER TABLE store_details DROP COLUMN IF EXISTS gstin;
   ```

   **Migration 5:**
   ```sql
   ALTER TABLE store_details ADD COLUMN IF NOT EXISTS minimum_order_value DECIMAL(10, 2);
   ```

3. **Exit psql:**
   ```sql
   \q
   ```

## Example Command (Replace with your URL):

```bash
psql "postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/dbname"
```

## Troubleshooting

**If you get "psql: command not found":**
- Windows: Install PostgreSQL from https://www.postgresql.org/download/windows/
- Mac: `brew install postgresql`
- Linux: `sudo apt-get install postgresql-client`

**If connection fails:**
- Make sure you're using the **External** URL (not Internal)
- Check that your IP is allowed (Render may require IP whitelisting)
- Verify the URL is correct (no extra spaces)

