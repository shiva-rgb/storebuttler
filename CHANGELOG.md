# Changelog

## Latest Updates

### Features Added

1. **Razorpay Payment Integration**
   - Store-specific Razorpay API keys (each store uses their own account)
   - Secure encryption of Razorpay key_secret using AES-256-CBC
   - Online payment option in checkout
   - Payment status tracking (paid, pending, failed)
   - Payment verification with signature validation

2. **Customer Orders View (Admin)**
   - Eye icon button to view all orders for a customer
   - Filter orders by Order ID and date range
   - Display total order value for filtered orders
   - Payment status display (COD/Paid Online)

3. **Minimum Order Value**
   - Store owners can set minimum order value
   - Customers see warning if cart value is below minimum
   - Checkout button disabled until minimum is met

4. **Order ID Format**
   - New format: `yyyymmdd<sequence>` (e.g., `2025111801`)
   - Date-prefixed order IDs for better organization

5. **Admin Orders Enhancements**
   - Total order value display for filtered orders
   - Payment method and status shown for each order

6. **Customer Order History**
   - Payment status display (COD/Paid Online/Payment Failed)
   - Refresh button with loading animation

### Database Changes

- Added `payment_method`, `payment_status`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `orders` table
- Added `razorpay_key_id`, `razorpay_key_secret` to `store_details` table
- Added `minimum_order_value` to `store_details` table
- Removed unused bank details columns (`account_holder_name`, `account_number`, `ifsc_code`, `branch`, `upi_id`)
- Removed `gstin` column from `store_details`

### Security Improvements

- AES-256-CBC encryption for sensitive Razorpay keys
- Environment variable support for encryption key
- Secure key storage in database

### Deployment

- Added Render deployment guide (`DEPLOYMENT.md`)
- Database connection supports both `DATABASE_URL` (Render) and individual variables (local)
- Migration guide for Render database (`migrations/RENDER_MIGRATION_GUIDE.md`)

### Files Modified

- `server.js` - Razorpay integration, new API endpoints
- `db/queries.js` - New queries for customer orders, order ID generation
- `public/admin.html` - Payment settings UI, customer orders modal
- `public/admin.js` - Payment settings logic, customer orders view
- `public/store.js` - Razorpay checkout, minimum order validation
- `public/order-history.js` - Payment status display
- `config/db.js` - Render database URL support
- `config/encryption.js` - New encryption utility

### Migration Files

- `012_add_payment_fields_to_orders.sql`
- `013_add_razorpay_keys_to_store_details.sql`
- `014_remove_unused_bank_details_columns.sql`
- `015_remove_gstin_from_store_details.sql`
- `016_add_minimum_order_value.sql`

