# Martify Web - Online Supermarket Ordering System

A web application that allows supermarket owners to upload their inventory via Excel sheets and automatically generate an online ordering website for their customers.

## Features

- **Excel Inventory Upload**: Upload inventory data via Excel files (.xlsx, .xls)
- **Admin Dashboard**: Manage inventory, view and update orders
- **Online Store**: Customer-facing website with product browsing, shopping cart, and checkout
- **Order Management**: Track and manage customer orders with status updates

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- PostgreSQL (v12 or higher)

### Database Setup

1. **Install PostgreSQL** (if not already installed):
   - Windows: Download from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)
   - macOS: `brew install postgresql` or download from [PostgreSQL Downloads](https://www.postgresql.org/download/macosx/)
   - Linux: `sudo apt-get install postgresql postgresql-contrib` (Ubuntu/Debian)

2. **Create Database**:
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE martify;
   
   # Exit psql
   \q
   ```

3. **Run Database Migrations**:
   ```bash
   # Connect to your database and run the migration script
   psql -U postgres -d martify -f migrations/001_create_tables.sql
   ```

4. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=martify
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   ```

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Migrate Existing Data (Optional)**:
   If you have existing JSON data files, migrate them to the database:
   ```bash
   node migrations/002_migrate_data.js
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Open your browser and navigate to**:
   - **Customer Store**: http://localhost:3000
   - **Admin Dashboard**: http://localhost:3000/admin.html

## File Format

Your inventory file (Excel .xlsx/.xls or CSV .csv) should include the following columns (column names are flexible):

- **Product Name** (or Name, Product, Item) - Required
- **Price** (or Cost, Unit Price) - Required
- **Quantity** (or Stock, Qty) - Required
- **Category** (or Type) - Optional
- **Description** (or Details) - Optional
- **Image** (or Image URL) - Optional (URL to product image)

### Example Format (CSV or Excel):

| Product Name | Price | Quantity | Category | Description | Image |
|-------------|-------|----------|----------|-------------|-------|
| Apple | 2.50 | 100 | Fruits | Fresh red apples | https://example.com/apple.jpg |
| Bread | 3.00 | 50 | Bakery | White bread loaf | |

## Usage

### For Store Owners (Admin):

1. Go to the Admin Dashboard
2. Upload your Excel inventory file
3. View and manage your products
4. Monitor incoming orders
5. Update order statuses

### For Customers:

1. Browse products on the store homepage
2. Add items to cart
3. View cart and adjust quantities
4. Checkout with customer information
5. Place order

## Project Structure

```
martifyweb/
├── server.js              # Express server and API endpoints
├── package.json           # Dependencies and scripts
├── config/                # Configuration files
│   └── db.js             # PostgreSQL database connection
├── db/                    # Database query functions
│   └── queries.js        # All database operations
├── migrations/            # Database migration scripts
│   ├── 001_create_tables.sql  # Create database tables
│   └── 002_migrate_data.js    # Migrate JSON data to database
├── public/                # Frontend files
│   ├── index.html        # Customer store page
│   ├── admin.html        # Admin dashboard
│   ├── styles.css        # Styling
│   ├── store.js          # Customer store logic
│   └── admin.js          # Admin dashboard logic
├── data/                  # Legacy JSON files (backup, can be removed after migration)
│   ├── inventory.json    # Product inventory (legacy)
│   └── orders.json       # Order records (legacy)
└── uploads/               # Temporary file uploads (auto-created)
```

## API Endpoints

- `POST /api/upload-inventory` - Upload Excel file
- `GET /api/inventory` - Get all products
- `GET /api/inventory/:id` - Get single product
- `PUT /api/inventory/:id` - Update product
- `DELETE /api/inventory/:id` - Delete product
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get all orders
- `PUT /api/orders/:id` - Update order status

## Technologies Used

- **Backend**: Node.js, Express
- **Frontend**: HTML, CSS, JavaScript
- **Database**: PostgreSQL
- **File Processing**: xlsx (Excel parsing)
- **Storage**: PostgreSQL database (migrated from JSON files)

## Database Schema

The application uses the following PostgreSQL tables:

- **products**: Stores inventory items (id, name, price, quantity, unit, category, description, image, created_at)
- **orders**: Stores customer orders (id, customer info, status, total, created_at)
- **order_items**: Stores order line items (id, order_id, product_id, quantity, product_name, product_price)
- **store_details**: Stores store configuration (single row with store name, contact info, UPI ID, etc.)

## Deployment

For deploying to Render (or other cloud platforms), see [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

### Quick Deployment Checklist

1. Push code to GitHub
2. Set up PostgreSQL database on Render
3. Run database migrations (see `migrations/RENDER_MIGRATION_GUIDE.md`)
4. Configure environment variables:
   - `DATABASE_URL` (or individual DB variables)
   - `JWT_SECRET` (generate with `openssl rand -base64 32`)
   - `ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)
5. Deploy web service on Render
6. Link database to web service

## Future Enhancements

- User authentication ✅
- Payment gateway integration ✅ (Razorpay)
- Email notifications
- Product image upload
- Advanced analytics
- Multi-store support

## License

ISC

