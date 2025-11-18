const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./config/encryption');
require('dotenv').config();

// Import database query functions
const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkInsertProducts,
  getAllOrders,
  generateOrderId,
  createOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  getStoreDetails,
  updateStoreDetails
} = require('./db/queries');

// Import authentication middleware and routes
const { authenticateToken } = require('./middleware/auth');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true // Allow cookies to be sent
}));
app.use(bodyParser.json());
app.use(cookieParser());

// Helper function to create URL-friendly slug from store name
function createSlug(text) {
  if (!text) return 'guest';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, and multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

// Keep /guest as explicit fallback route
app.get('/guest', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dynamic store route - serve the customer store based on store name
// This route handles /<store-name-slug> but must come after API routes
// Note: API routes are defined later, so they take precedence
app.get('/:storeSlug', (req, res, next) => {
  const storeSlug = req.params.storeSlug;
  
  // Skip if it's an API route or static file (with extension)
  if (storeSlug.startsWith('api') || /\./.test(storeSlug)) {
    return next();
  }
  
  // Always serve index.html for any store slug
  // The store name in URL is for branding/SEO purposes
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static('public'));

// Mount authentication routes (before protected routes)
app.use('/api/auth', authRoutes);

// Mount customer authentication routes
const customerAuthRoutes = require('./routes/customerAuth');
app.use('/api/customer-auth', customerAuthRoutes);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) or CSV (.csv) files are allowed!'));
    }
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Database operations are now handled by db/queries.js

// API Routes

// Upload Excel and parse inventory (protected)
app.post('/api/upload-inventory', authenticateToken, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    processUpload(req, res);
  });
});

function processUpload(req, res) {
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const isCSV = fileExt === '.csv';
  
  if (isCSV) {
    processCSVFile(req, res);
  } else {
    processExcelFile(req, res);
  }
}

function processCSVFile(req, res) {
  const results = [];
  
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      try {
        if (!results || results.length === 0) {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(400).json({ error: 'CSV file is empty or has no data' });
        }

        // Process and format inventory data
        const inventory = results.map((row, index) => {
          // Handle different possible column names
          const name = row['Product Name'] || row['Name'] || row['Product'] || row['Item'] || '';
          const price = parseFloat(row['Price'] || row['Cost'] || row['Unit Price'] || 0);
          const quantity = parseInt(row['Quantity'] || row['Stock'] || row['Qty'] || 0);
          const unit = (row['Unit'] || row['Units'] || '').toString().trim();
          const category = row['Category'] || row['Type'] || 'Uncategorized';
          const description = row['Description'] || row['Details'] || '';
          const image = row['Image'] || row['Image URL'] || '';

          // Debug: log first row to check unit extraction
          if (index === 0) {
            console.log('Sample Excel row:', row);
            console.log('Extracted unit:', unit);
          }

          return {
            id: `prod_${Date.now()}_${index}`,
            name: name.toString().trim(),
            price: isNaN(price) ? 0 : price,
            quantity: isNaN(quantity) ? 0 : quantity,
            unit: unit,
            category: category.toString().trim(),
            description: description.toString().trim(),
            image: image.toString().trim(),
            createdAt: new Date().toISOString()
          };
        }).filter(item => item.name); // Remove items without names

        if (inventory.length === 0) {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(400).json({ error: 'No valid products found in CSV file. Please check column names.' });
        }

        // Save inventory to database
        const userId = req.user.id;
        bulkInsertProducts(inventory, userId)
          .then((insertedProducts) => {
            // Clean up uploaded file
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }

            res.json({
              success: true,
              message: `Successfully imported ${insertedProducts.length} products from CSV`,
              count: insertedProducts.length,
              inventory: insertedProducts
            });
          })
          .catch((error) => {
            // Clean up uploaded file
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
            console.error('Error saving inventory to database:', error);
            res.status(500).json({ error: 'Error saving inventory to database: ' + error.message });
          });
      } catch (error) {
        console.error('Error processing CSV:', error);
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error processing CSV file: ' + error.message });
      }
    })
    .on('error', (error) => {
      console.error('CSV parsing error:', error);
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({ error: 'Error reading CSV file: ' + error.message });
    });
}

function processExcelFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check if file exists and can be read
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({ error: 'File upload failed' });
    }

    let workbook;
    try {
      workbook = xlsx.readFile(req.file.path);
    } catch (error) {
      // Clean up file if it can't be read
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Invalid Excel file: ' + error.message });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Excel file has no sheets' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (!data || data.length === 0) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Excel file is empty or has no data' });
    }

    // Process and format inventory data
    const inventory = data.map((row, index) => {
      // Handle different possible column names
      const name = row['Product Name'] || row['Name'] || row['Product'] || row['Item'] || '';
      const price = parseFloat(row['Price'] || row['Cost'] || row['Unit Price'] || 0);
      const quantity = parseInt(row['Quantity'] || row['Stock'] || row['Qty'] || 0);
      const unit = (row['Unit'] || row['Units'] || '').toString().trim();
      const category = row['Category'] || row['Type'] || 'Uncategorized';
      const description = row['Description'] || row['Details'] || '';
      const image = row['Image'] || row['Image URL'] || '';

      // Debug: log first row to check unit extraction
      if (index === 0) {
        console.log('Sample CSV row:', row);
        console.log('Extracted unit:', unit);
      }

      return {
        id: `prod_${Date.now()}_${index}`,
        name: name.toString().trim(),
        price: isNaN(price) ? 0 : price,
        quantity: isNaN(quantity) ? 0 : quantity,
        unit: unit,
        category: category.toString().trim(),
        description: description.toString().trim(),
        image: image.toString().trim(),
        createdAt: new Date().toISOString()
      };
    }).filter(item => item.name); // Remove items without names

    if (inventory.length === 0) {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'No valid products found in Excel file. Please check column names.' });
    }

    // Save inventory to database
    const userId = req.user.id;
    bulkInsertProducts(inventory, userId)
      .then((insertedProducts) => {
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        res.json({
          success: true,
          message: `Successfully imported ${insertedProducts.length} products from Excel`,
          count: insertedProducts.length,
          inventory: insertedProducts
        });
      })
      .catch((error) => {
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error('Error saving inventory to database:', error);
        res.status(500).json({ error: 'Error saving inventory to database: ' + error.message });
      });
  } catch (error) {
    console.error('Error processing Excel file:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    res.status(500).json({ error: 'Error processing Excel file: ' + error.message });
  }
}

// Get all inventory
app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const inventory = await getAllProducts(req.user.id);
    res.json(inventory);
  } catch (error) {
    console.error('Error getting inventory:', error);
    res.status(500).json({ error: 'Error fetching inventory: ' + error.message });
  }
});

// Create new product
app.post('/api/inventory', authenticateToken, async (req, res) => {
  console.log('POST /api/inventory called');
  try {
    const { name, price, quantity, unit, category, description, image } = req.body;
    console.log('Received product data:', { name, price, quantity, unit, category });
    
    if (!name || price === undefined || quantity === undefined) {
      return res.status(400).json({ error: 'Name, price, and quantity are required' });
    }
    
    const newProduct = {
      id: `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.toString().trim(),
      price: parseFloat(price) || 0,
      quantity: parseInt(quantity) || 0,
      unit: (unit || '').toString().trim(),
      category: (category || 'Uncategorized').toString().trim(),
      description: (description || '').toString().trim(),
      image: (image || '').toString().trim(),
      createdAt: new Date().toISOString()
    };
    
    const createdProduct = await createProduct(newProduct, req.user.id);
    
    res.json({
      success: true,
      product: createdProduct
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error creating product: ' + error.message });
  }
});

// Get single product
app.get('/api/inventory/:id', authenticateToken, async (req, res) => {
  try {
    const product = await getProductById(req.params.id, req.user.id);
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    console.error('Error getting product:', error);
    res.status(500).json({ error: 'Error fetching product: ' + error.message });
  }
});

// Update inventory
app.put('/api/inventory/:id', authenticateToken, async (req, res) => {
  try {
    const updatedProduct = await updateProduct(req.params.id, req.body, req.user.id);
    if (updatedProduct) {
      res.json(updatedProduct);
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error updating product: ' + error.message });
  }
});

// Delete product
app.delete('/api/inventory/:id', authenticateToken, async (req, res) => {
  try {
    const deletedProduct = await deleteProduct(req.params.id, req.user.id);
    if (deletedProduct) {
      res.json({ success: true, message: 'Product deleted' });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error deleting product: ' + error.message });
  }
});

// Public store endpoints (for customers)
app.get('/api/store/:storeSlug/products', async (req, res) => {
  try {
    const { storeSlug } = req.params;
    const { getStoreDetailsBySlug, getProductsByUserId } = require('./db/queries');
    
    // Find store by slug
    const store = await getStoreDetailsBySlug(storeSlug);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    // Get products for this store's user
    const products = await getProductsByUserId(store.user_id);
    res.json(products);
  } catch (error) {
    console.error('Error getting store products:', error);
    res.status(500).json({ error: 'Error fetching products: ' + error.message });
  }
});

app.get('/api/store/:storeSlug/details', async (req, res) => {
  try {
    const { storeSlug } = req.params;
    const { getStoreDetailsBySlug } = require('./db/queries');
    
    const store = await getStoreDetailsBySlug(storeSlug);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    // Parse operating schedule days if it's a JSON string
    let operatingScheduleDays = null;
    if (store.operating_schedule_days) {
      if (typeof store.operating_schedule_days === 'string') {
        try {
          operatingScheduleDays = JSON.parse(store.operating_schedule_days);
        } catch (e) {
          operatingScheduleDays = store.operating_schedule_days;
        }
      } else {
        operatingScheduleDays = store.operating_schedule_days;
      }
    }
    
    res.json({
      storeName: store.store_name || '',
      contactNumber1: store.contact_number_1 || '',
      contactNumber2: store.contact_number_2 || '',
      email: store.email || '',
      address: store.address || '',
      instructions: store.instructions || '',
      minimumOrderValue: store.minimum_order_value !== null && store.minimum_order_value !== undefined ? parseFloat(store.minimum_order_value) : null,
      isLive: store.is_live || false,
      onlinePaymentEnabled: store.online_payment_enabled === true || store.online_payment_enabled === 'true',
      razorpayKeyId: store.razorpay_key_id || null,
      operatingScheduleEnabled: store.operating_schedule_enabled || false,
      operatingScheduleDays: operatingScheduleDays,
      operatingScheduleStartTime: store.operating_schedule_start_time || null,
      operatingScheduleEndTime: store.operating_schedule_end_time || null,
      operatingScheduleTimezone: store.operating_schedule_timezone || 'Asia/Kolkata'
    });
  } catch (error) {
    console.error('Error getting store details:', error);
    res.status(500).json({ error: 'Error fetching store details: ' + error.message });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { 
      id,
      items, 
      customerInfo, 
      storeSlug,
      paymentMethod = 'cod',
      paymentStatus = 'paid',
      razorpayOrderId = null
    } = req.body;
    
    console.log('[SERVER] Creating order:', {
      id,
      paymentMethod,
      paymentStatus,
      itemCount: items?.length
    });
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid order items' });
    }

    // Check if store is live (if storeSlug is provided)
    if (storeSlug) {
      const { getStoreDetailsBySlug } = require('./db/queries');
      const store = await getStoreDetailsBySlug(storeSlug);
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }
      if (!store.is_live) {
        return res.status(503).json({ error: 'Store is currently under maintenance. Please try again later.' });
      }
    }

    // Check if customer is logged in (optional - guest orders are allowed)
    let customerId = null;
    const { authenticateCustomer } = require('./middleware/customerAuth');
    const customerToken = req.cookies?.customerToken;
    if (customerToken) {
      const { verifyToken } = require('./config/auth');
      const decoded = verifyToken(customerToken);
      if (decoded && decoded.customerId) {
        customerId = decoded.customerId;
      }
    }

    // Calculate total from items (prices should be included from frontend)
    const total = items.reduce((sum, item) => {
      const price = item.productPrice || 0;
      return sum + (price * item.quantity);
    }, 0);

    // Generate order ID if not provided
    let orderId = id;
    if (!orderId) {
      orderId = await generateOrderId();
    }
    
    // Create order (this handles validation, inventory updates, and order creation in a transaction)
    const order = {
      id: orderId,
      items: items,
      customerInfo: customerInfo || {},
      status: 'pending',
      total: total,
      createdAt: new Date().toISOString(),
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      razorpayOrderId: razorpayOrderId
    };

    const createdOrder = await createOrder(order, null, customerId);
    console.log('[SERVER] Order created successfully:', {
      id: createdOrder.id,
      paymentMethod: createdOrder.paymentMethod,
      paymentStatus: createdOrder.paymentStatus
    });
    res.json({ success: true, order: createdOrder });
  } catch (error) {
    console.error('[SERVER] Error creating order:', error);
    res.status(500).json({ error: error.message || 'Error creating order: ' + error.message });
  }
});

// Get all orders (protected)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await getAllOrders(req.user.id);
    res.json(orders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ error: 'Error fetching orders: ' + error.message });
  }
});

// Update order status (protected)
app.put('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const updatedOrder = await updateOrderStatus(req.params.id, req.body, req.user.id);
    if (updatedOrder) {
      res.json(updatedOrder);
    } else {
      res.status(404).json({ error: 'Order not found' });
    }
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Error updating order: ' + error.message });
  }
});

// Customer API endpoints
const { authenticateCustomer } = require('./middleware/customerAuth');
const { getCustomerOrders, getCustomerById } = require('./db/queries');

// Get customer order history (protected)
app.get('/api/customer/orders', authenticateCustomer, async (req, res) => {
  try {
    const orders = await getCustomerOrders(req.customer.id);
    res.json(orders);
  } catch (error) {
    console.error('Error getting customer orders:', error);
    res.status(500).json({ error: 'Error fetching orders: ' + error.message });
  }
});

// Get order details for repeat order (protected)
app.get('/api/customer/orders/:orderId', authenticateCustomer, async (req, res) => {
  try {
    const { orderId } = req.params;
    const orders = await getCustomerOrders(req.customer.id);
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error getting order details:', error);
    res.status(500).json({ error: 'Error fetching order: ' + error.message });
  }
});

// Admin customer list endpoint (protected)
app.get('/api/admin/customers', authenticateToken, async (req, res) => {
  try {
    const { getAllCustomers } = require('./db/queries');
    const customers = await getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({ error: 'Error fetching customers: ' + error.message });
  }
});

// Admin customer orders endpoint (protected)
app.get('/api/admin/customers/:customerId/orders', authenticateToken, async (req, res) => {
  try {
    const { getCustomerOrdersForAdmin } = require('./db/queries');
    const customerId = parseInt(req.params.customerId);
    const userId = req.user.id;
    
    if (isNaN(customerId)) {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    
    const orders = await getCustomerOrdersForAdmin(customerId, userId);
    res.json(orders);
  } catch (error) {
    console.error('Error getting customer orders:', error);
    res.status(500).json({ error: 'Error fetching customer orders: ' + error.message });
  }
});

// Get payment settings
app.get('/api/payment', authenticateToken, async (req, res) => {
  try {
    const payment = await getStoreDetails(req.user.id);
    // Include Razorpay key_id but not key_secret for security
    res.json({
      ...payment,
      razorpayKeyId: payment.razorpayKeyId || null
      // key_secret is not returned for security
    });
  } catch (error) {
    console.error('Error getting store details:', error);
    res.status(500).json({ error: 'Error fetching store details: ' + error.message });
  }
});

// Save Razorpay API keys (protected)
app.put('/api/payment/razorpay-keys', authenticateToken, async (req, res) => {
  try {
    const { razorpayKeyId, razorpayKeySecret, onlinePaymentEnabled, keepExistingSecret } = req.body;
    
    if (!razorpayKeyId) {
      return res.status(400).json({ error: 'Razorpay Key ID is required' });
    }
    
    // Get current store details
    const currentDetails = await getStoreDetails(req.user.id);
    
    if (!currentDetails.storeName) {
      return res.status(400).json({ error: 'Store details must be configured first. Please set up your store details.' });
    }
    
    // Prepare update object
    const updateData = {
      storeName: currentDetails.storeName,
      contactNumber1: currentDetails.contactNumber1,
      contactNumber2: currentDetails.contactNumber2 || '',
      email: currentDetails.email || '',
      address: currentDetails.address,
      instructions: currentDetails.instructions || '',
      isLive: currentDetails.isLive || false,
      razorpayKeyId: razorpayKeyId,
      onlinePaymentEnabled: onlinePaymentEnabled !== undefined ? onlinePaymentEnabled : true
    };
    
    // If keepExistingSecret is true, don't include key_secret (it will be preserved)
    // Otherwise, require and encrypt the new key_secret
    if (!keepExistingSecret) {
      if (!razorpayKeySecret) {
        return res.status(400).json({ error: 'Razorpay Key Secret is required' });
      }
      // Encrypt the key_secret before storing
      updateData.razorpayKeySecret = encrypt(razorpayKeySecret);
    }
    // If keepExistingSecret is true, we don't include razorpayKeySecret in updateData,
    // and updateStoreDetails will skip updating it
    
    // Update store details with Razorpay keys
    const updatedDetails = await updateStoreDetails(updateData, req.user.id, keepExistingSecret);
    
    res.json({ 
      success: true, 
      razorpayKeyId: updatedDetails.razorpayKeyId,
      onlinePaymentEnabled: updatedDetails.onlinePaymentEnabled
    });
  } catch (error) {
    console.error('[SERVER] Error saving Razorpay keys:', error);
    console.error('[SERVER] Error stack:', error.stack);
    res.status(500).json({ error: 'Error saving Razorpay keys: ' + error.message });
  }
});

// Update store live status (protected)
app.put('/api/store/live-status', authenticateToken, async (req, res) => {
  try {
    const { isLive } = req.body;
    
    // Get current store details
    const currentDetails = await getStoreDetails(req.user.id);
    
    // If store details don't exist yet, return error
    if (!currentDetails.storeName) {
      return res.status(400).json({ error: 'Store details must be configured first. Please set up your store details.' });
    }
    
    // Update only the isLive status
    const updatedDetails = await updateStoreDetails({
      storeName: currentDetails.storeName,
      contactNumber1: currentDetails.contactNumber1,
      contactNumber2: currentDetails.contactNumber2 || '',
      email: currentDetails.email || '',
      address: currentDetails.address,
      instructions: currentDetails.instructions || '',
      isLive: isLive === true || isLive === 'true'
    }, req.user.id);
    
    res.json({ success: true, isLive: updatedDetails.isLive });
  } catch (error) {
    console.error('Error updating store live status:', error);
    res.status(500).json({ error: 'Error updating store status: ' + error.message });
  }
});

// Update online payment status (protected)
app.put('/api/payment/online-payment-status', authenticateToken, async (req, res) => {
  try {
    const { onlinePaymentEnabled } = req.body;
    const { getStoreDetails, updateStoreDetails } = require('./db/queries');
    
    // Get current store details
    const currentDetails = await getStoreDetails(req.user.id);
    
    if (!currentDetails.storeName) {
      return res.status(400).json({ error: 'Store details must be configured first. Please set up your store details.' });
    }
    
    // Update only the online payment enabled status
    const updatedDetails = await updateStoreDetails({
      storeName: currentDetails.storeName,
      contactNumber1: currentDetails.contactNumber1,
      contactNumber2: currentDetails.contactNumber2 || '',
      email: currentDetails.email || '',
      address: currentDetails.address,
      instructions: currentDetails.instructions || '',
      isLive: currentDetails.isLive || false,
      onlinePaymentEnabled: onlinePaymentEnabled === true || onlinePaymentEnabled === 'true'
    }, req.user.id);
    
    res.json({ 
      success: true, 
      onlinePaymentEnabled: updatedDetails.onlinePaymentEnabled 
    });
  } catch (error) {
    console.error('[SERVER] Error updating online payment status:', error);
    console.error('[SERVER] Error stack:', error.stack);
    res.status(500).json({ error: 'Error updating online payment status: ' + error.message });
  }
});

// Update store details (formerly payment settings) (protected)
app.put('/api/payment', authenticateToken, async (req, res) => {
  console.log('PUT /api/payment called');
  try {
    const { 
      storeName, 
      contactNumber1, 
      contactNumber2, 
      email,
      instructions, 
      address, 
      isLive,
      minimumOrderValue,
      operatingScheduleEnabled,
      operatingScheduleDays,
      operatingScheduleStartTime,
      operatingScheduleEndTime,
      operatingScheduleTimezone
    } = req.body;
    console.log('Received store details data:', { 
      storeName, 
      contactNumber1, 
      contactNumber2, 
      email,
      instructions, 
      address, 
      isLive,
      minimumOrderValue
    });
    
    // Get current store details to preserve values if not provided
    const { getStoreDetails } = require('./db/queries');
    const currentDetails = await getStoreDetails(req.user.id);
    
    // Only validate required fields if they are being updated (not just operating schedule)
    // If only operating schedule fields are provided, skip validation
    const isOnlyOperatingScheduleUpdate = 
      operatingScheduleEnabled !== undefined || 
      operatingScheduleDays !== undefined || 
      operatingScheduleStartTime !== undefined || 
      operatingScheduleEndTime !== undefined || 
      operatingScheduleTimezone !== undefined;
    
    const isUpdatingStoreDetails = storeName !== undefined || contactNumber1 !== undefined || address !== undefined;
    
    // If updating store details (not just schedule), validate required fields
    if (isUpdatingStoreDetails) {
      const finalStoreName = storeName !== undefined ? storeName.trim() : (currentDetails.storeName || '');
      const finalContactNumber1 = contactNumber1 !== undefined ? contactNumber1.trim() : (currentDetails.contactNumber1 || '');
      const finalAddress = address !== undefined ? address.trim() : (currentDetails.address || '');
      
      if (!finalStoreName || finalStoreName === '') {
        return res.status(400).json({ error: 'Store Name is required' });
      }
      
      if (!finalContactNumber1 || finalContactNumber1 === '') {
        return res.status(400).json({ error: 'Contact Number 1 is required' });
      }
      
      if (!finalAddress || finalAddress === '') {
        return res.status(400).json({ error: 'Address is required' });
      }
    }
    
    const storeDetails = {
      // Only include store details fields if they are being updated
      storeName: storeName !== undefined ? storeName.trim() : currentDetails.storeName,
      contactNumber1: contactNumber1 !== undefined ? contactNumber1.trim() : currentDetails.contactNumber1,
      contactNumber2: contactNumber2 !== undefined ? (contactNumber2 || '').trim() : (currentDetails.contactNumber2 || ''),
      email: email !== undefined ? (email || '').trim() : (currentDetails.email || ''),
      address: address !== undefined ? address.trim() : currentDetails.address,
      instructions: instructions !== undefined ? (instructions || '').trim() : (currentDetails.instructions || ''),
      // Preserve existing isLive if not provided, otherwise use the provided value
      isLive: isLive !== undefined ? (isLive === true || isLive === 'true') : (currentDetails.isLive || false),
      // Preserve existing onlinePaymentEnabled if not provided
      onlinePaymentEnabled: currentDetails.onlinePaymentEnabled || false,
      minimumOrderValue: minimumOrderValue !== undefined && minimumOrderValue !== null && minimumOrderValue !== '' ? parseFloat(minimumOrderValue) : (currentDetails.minimumOrderValue || null),
      // Operating schedule fields
      operatingScheduleEnabled: operatingScheduleEnabled !== undefined ? (operatingScheduleEnabled === true || operatingScheduleEnabled === 'true') : (currentDetails.operatingScheduleEnabled || false),
      operatingScheduleDays: operatingScheduleDays !== undefined ? operatingScheduleDays : (currentDetails.operatingScheduleDays || null),
      operatingScheduleStartTime: operatingScheduleStartTime !== undefined && operatingScheduleStartTime !== null && operatingScheduleStartTime !== '' ? operatingScheduleStartTime : (currentDetails.operatingScheduleStartTime || null),
      operatingScheduleEndTime: operatingScheduleEndTime !== undefined && operatingScheduleEndTime !== null && operatingScheduleEndTime !== '' ? operatingScheduleEndTime : (currentDetails.operatingScheduleEndTime || null),
      operatingScheduleTimezone: operatingScheduleTimezone !== undefined && operatingScheduleTimezone !== null && operatingScheduleTimezone !== '' ? operatingScheduleTimezone : (currentDetails.operatingScheduleTimezone || 'Asia/Kolkata'),
      updatedAt: new Date().toISOString()
    };
    
    const updatedDetails = await updateStoreDetails(storeDetails, req.user.id);
    res.json({ success: true, payment: updatedDetails });
  } catch (error) {
    console.error('Error saving store details:', error);
    res.status(500).json({ error: 'Error saving store details: ' + error.message });
  }
});


// Razorpay Integration Endpoints

// Get Razorpay public key for a store (key_id is safe to expose)
app.get('/api/razorpay/key/:storeSlug', async (req, res) => {
  try {
    const { storeSlug } = req.params;
    const { getStoreDetailsBySlug } = require('./db/queries');
    const store = await getStoreDetailsBySlug(storeSlug);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    if (!store.online_payment_enabled || !store.razorpay_key_id) {
      return res.status(400).json({ error: 'Online payment is not enabled for this store' });
    }
    
    res.json({
      key: store.razorpay_key_id
    });
  } catch (error) {
    console.error('Error getting Razorpay key:', error);
    res.status(500).json({ error: 'Error getting payment key' });
  }
});

// Create Razorpay order using store-specific keys
app.post('/api/razorpay/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes, storeSlug } = req.body;
    
    if (!storeSlug) {
      return res.status(400).json({ error: 'Store slug is required' });
    }
    
    console.log('[SERVER] Creating Razorpay order for store:', storeSlug, { amount, currency, receipt });
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Get store details to retrieve Razorpay keys
    const { getStoreDetailsBySlug } = require('./db/queries');
    const store = await getStoreDetailsBySlug(storeSlug);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    if (!store.online_payment_enabled || !store.razorpay_key_id || !store.razorpay_key_secret) {
      return res.status(400).json({ error: 'Online payment is not properly configured for this store' });
    }
    
    // Decrypt the key_secret
    let keySecret;
    try {
      if (!store.razorpay_key_secret) {
        console.error('[SERVER] Razorpay key_secret is missing in database');
        return res.status(500).json({ error: 'Payment configuration error: Razorpay secret key is missing. Please re-enter your Razorpay keys in store settings.' });
      }
      keySecret = decrypt(store.razorpay_key_secret);
      if (!keySecret) {
        throw new Error('Decryption returned empty result');
      }
    } catch (decryptError) {
      console.error('[SERVER] Error decrypting Razorpay key secret:', decryptError);
      console.error('[SERVER] This usually means the ENCRYPTION_KEY has changed or the stored key is corrupted.');
      return res.status(500).json({ error: 'Payment configuration error: Unable to decrypt Razorpay keys. Please re-enter your Razorpay keys in store settings. If the issue persists, check your ENCRYPTION_KEY environment variable.' });
    }
    
    // Initialize Razorpay with store-specific keys
    const razorpay = new Razorpay({
      key_id: store.razorpay_key_id,
      key_secret: keySecret
    });
    
    // Convert amount to paise (Razorpay expects amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);
    console.log('[SERVER] Amount in paise:', amountInPaise);
    
    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    };
    
    const razorpayOrder = await razorpay.orders.create(options);
    console.log('[SERVER] Razorpay order created:', razorpayOrder.id);
    
    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt
      }
    });
  } catch (error) {
    console.error('[SERVER] Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Error creating payment order: ' + error.message });
  }
});

// Verify payment and update order using store-specific keys
app.post('/api/razorpay/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
      storeSlug
    } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id || !storeSlug) {
      return res.status(400).json({ error: 'Missing required payment verification fields' });
    }
    
    // Get store details to retrieve Razorpay keys
    const { getStoreDetailsBySlug, updateOrderPaymentStatus } = require('./db/queries');
    const store = await getStoreDetailsBySlug(storeSlug);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    if (!store.online_payment_enabled || !store.razorpay_key_id || !store.razorpay_key_secret) {
      return res.status(400).json({ error: 'Online payment is not properly configured for this store' });
    }
    
    // Decrypt the key_secret
    let keySecret;
    try {
      if (!store.razorpay_key_secret) {
        console.error('[SERVER] Razorpay key_secret is missing in database');
        return res.status(500).json({ error: 'Payment configuration error: Razorpay secret key is missing. Please re-enter your Razorpay keys in store settings.' });
      }
      keySecret = decrypt(store.razorpay_key_secret);
      if (!keySecret) {
        throw new Error('Decryption returned empty result');
      }
    } catch (decryptError) {
      console.error('[SERVER] Error decrypting Razorpay key secret:', decryptError);
      console.error('[SERVER] This usually means the ENCRYPTION_KEY has changed or the stored key is corrupted.');
      return res.status(500).json({ error: 'Payment configuration error: Unable to decrypt Razorpay keys. Please re-enter your Razorpay keys in store settings. If the issue persists, check your ENCRYPTION_KEY environment variable.' });
    }
    
    // Verify signature using store-specific key_secret
    const text = razorpay_order_id + '|' + razorpay_payment_id;
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(text)
      .digest('hex');
    
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
    
    // Update order with payment details
    await updateOrderPaymentStatus(order_id, {
      paymentStatus: 'paid',
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature
    });
    
    res.json({
      success: true,
      message: 'Payment verified and order updated successfully'
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Error verifying payment: ' + error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

