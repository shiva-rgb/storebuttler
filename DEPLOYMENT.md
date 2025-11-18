# Deployment Guide for Render

This guide will help you deploy the Supermart Web application to Render and set up the database.

## Prerequisites

- GitHub repository with your code
- Render account (free tier available)
- PostgreSQL database (Render provides this)

## Step 1: Push Code to GitHub

1. **Commit all changes:**
   ```bash
   git add .
   git commit -m "Add Razorpay integration, customer orders view, minimum order value, and other features"
   ```

2. **Push to GitHub:**
   ```bash
   git push origin main
   ```

## Step 2: Set Up PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure:
   - **Name**: `supermartweb-db` (or your preferred name)
   - **Database**: `supermartweb` (or your preferred name)
   - **User**: Auto-generated
   - **Region**: Choose closest to your users
   - **PostgreSQL Version**: Latest stable
   - **Plan**: Free tier (or paid if needed)

4. **Note the connection details** from the database dashboard:
   - Internal Database URL (for Render services)
   - External Database URL (for local connections)
   - Host, Port, Database, User, Password

## Step 3: Run Database Migrations

You have two options:

### Option A: Using Render's PostgreSQL Dashboard (Recommended)

1. Go to your PostgreSQL database on Render
2. Click on **"Connect"** → **"psql"** (opens a web-based terminal)
3. Run migrations in order:

```sql
-- Migration 001: Create base tables (if not already run)
-- Run migrations/001_create_tables.sql

-- Migration 002-010: Run if not already applied
-- (Check your database to see which ones are already applied)

-- Migration 011: Add bank details (later removed, but may be needed for migration path)
-- Skip if columns don't exist

-- Migration 012: Add payment fields to orders
\i migrations/012_add_payment_fields_to_orders.sql

-- Migration 013: Add Razorpay keys
\i migrations/013_add_razorpay_keys_to_store_details.sql

-- Migration 014: Remove unused bank details columns
\i migrations/014_remove_unused_bank_details_columns.sql

-- Migration 015: Remove GSTIN
\i migrations/015_remove_gstin_from_store_details.sql

-- Migration 016: Add minimum order value
\i migrations/016_add_minimum_order_value.sql
```

**Note**: If you can't use `\i` in Render's psql, copy and paste the SQL content directly.

### Option B: Using Local psql (if you have external access)

1. Get the **External Database URL** from Render
2. Connect from your local machine:
   ```bash
   psql "postgresql://user:password@host:port/database"
   ```
3. Run each migration file:
   ```bash
   psql "postgresql://..." -f migrations/012_add_payment_fields_to_orders.sql
   psql "postgresql://..." -f migrations/013_add_razorpay_keys_to_store_details.sql
   psql "postgresql://..." -f migrations/014_remove_unused_bank_details_columns.sql
   psql "postgresql://..." -f migrations/015_remove_gstin_from_store_details.sql
   psql "postgresql://..." -f migrations/016_add_minimum_order_value.sql
   ```

## Step 4: Deploy Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `supermartweb` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier (or paid if needed)

## Step 5: Configure Environment Variables

In your Render Web Service dashboard, go to **"Environment"** and add:

### Required Environment Variables:

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@host:port/database
# OR use individual variables:
DB_HOST=your-db-host.onrender.com
DB_PORT=5432
DB_NAME=supermartweb
DB_USER=your-db-user
DB_PASSWORD=your-db-password

# JWT Secret (IMPORTANT: Use a strong random string)
JWT_SECRET=your-very-secure-random-secret-key-here

# Encryption Key for Razorpay keys (IMPORTANT: Use a 64-character hex string)
# Generate one using: openssl rand -hex 32
ENCRYPTION_KEY=your-64-character-hex-encryption-key-here

# Port (optional, Render sets this automatically)
PORT=3000
```

### How to Generate Secure Keys:

**JWT_SECRET:**
```bash
# Generate a random string (32+ characters)
openssl rand -base64 32
```

**ENCRYPTION_KEY:**
```bash
# Generate a 64-character hex string (required for AES-256)
openssl rand -hex 32
```

**Important Notes:**
- Never commit these keys to GitHub
- Use different keys for production and development
- Store them securely in Render's environment variables
- If you change `ENCRYPTION_KEY` after storing Razorpay keys, you'll need to re-enter them

## Step 6: Link Database to Web Service

1. In your Web Service dashboard, go to **"Environment"**
2. Under **"Add Environment Variable"**, you can:
   - Use `DATABASE_URL` from your PostgreSQL service (Render provides this automatically if services are linked)
   - OR manually add individual DB variables

3. **Link the database** (if not auto-linked):
   - In Web Service → **"Environment"** → **"Link Database"**
   - Select your PostgreSQL database

## Step 7: Verify Deployment

1. Check the **"Logs"** tab in Render to ensure the app started successfully
2. Visit your Render URL (e.g., `https://supermartweb.onrender.com`)
3. Test:
   - Admin login
   - Customer store access
   - Order placement
   - Payment integration (if configured)

## Step 8: Update Database Connection for Render

If your `config/db.js` doesn't support `DATABASE_URL`, Render provides it automatically. The current code should work, but if you need to support `DATABASE_URL` format, you can update `config/db.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL and individual variables
let poolConfig;

if (process.env.DATABASE_URL) {
  // Render provides DATABASE_URL
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Render PostgreSQL
    }
  };
} else {
  // Local development
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'martify',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);
```

## Troubleshooting

### Database Connection Issues

- Ensure `DATABASE_URL` or individual DB variables are set correctly
- Check that the database is running (Render shows status)
- Verify SSL settings if using external connection

### Migration Issues

- Check if columns already exist before running migrations
- Some migrations use `IF NOT EXISTS` or `IF EXISTS` to handle this
- Review error messages in Render logs

### Environment Variable Issues

- Ensure all required variables are set
- Check for typos in variable names
- Restart the service after adding new variables

### Encryption Key Issues

- If you change `ENCRYPTION_KEY`, existing encrypted Razorpay keys will be invalid
- Store owners will need to re-enter their Razorpay keys
- Use a consistent key across deployments

## Migration Checklist

Before deploying, ensure these migrations are run:

- [ ] 001_create_tables.sql (base tables)
- [ ] 002-010 (if not already applied)
- [ ] 012_add_payment_fields_to_orders.sql
- [ ] 013_add_razorpay_keys_to_store_details.sql
- [ ] 014_remove_unused_bank_details_columns.sql
- [ ] 015_remove_gstin_from_store_details.sql
- [ ] 016_add_minimum_order_value.sql

## Support

For issues:
1. Check Render logs
2. Verify environment variables
3. Test database connection
4. Review migration status

