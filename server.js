const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
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
  createOrder,
  updateOrderStatus,
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
    
    res.json({
      storeName: store.store_name || '',
      contactNumber1: store.contact_number_1 || '',
      contactNumber2: store.contact_number_2 || '',
      email: store.email || '',
      address: store.address || '',
      gstin: store.gstin || '',
      upiId: store.upi_id || '',
      instructions: store.instructions || '',
      isLive: store.is_live || false
    });
  } catch (error) {
    console.error('Error getting store details:', error);
    res.status(500).json({ error: 'Error fetching store details: ' + error.message });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { items, customerInfo, storeSlug } = req.body;
    
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

    // Calculate total from items (prices should be included from frontend)
    const total = items.reduce((sum, item) => {
      const price = item.productPrice || 0;
      return sum + (price * item.quantity);
    }, 0);

    // Create order (this handles validation, inventory updates, and order creation in a transaction)
    const order = {
      id: `order_${Date.now()}`,
      items: items,
      customerInfo: customerInfo || {},
      status: 'pending',
      total: total,
      createdAt: new Date().toISOString()
    };

    const createdOrder = await createOrder(order);
    res.json({ success: true, order: createdOrder });
  } catch (error) {
    console.error('Error creating order:', error);
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

// Get payment settings
app.get('/api/payment', authenticateToken, async (req, res) => {
  try {
    const payment = await getStoreDetails(req.user.id);
    res.json(payment);
  } catch (error) {
    console.error('Error getting store details:', error);
    res.status(500).json({ error: 'Error fetching store details: ' + error.message });
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
      gstin: currentDetails.gstin || '',
      upiId: currentDetails.upiId || '', // UPI ID is optional (disabled)
      instructions: currentDetails.instructions || '',
      isLive: isLive === true || isLive === 'true'
    }, req.user.id);
    
    res.json({ success: true, isLive: updatedDetails.isLive });
  } catch (error) {
    console.error('Error updating store live status:', error);
    res.status(500).json({ error: 'Error updating store status: ' + error.message });
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
      upiId, 
      instructions, 
      address, 
      gstin,
      isLive
    } = req.body;
    console.log('Received store details data:', { 
      storeName, 
      contactNumber1, 
      contactNumber2, 
      email,
      upiId, 
      instructions, 
      address, 
      gstin,
      isLive
    });
    
    if (!storeName || storeName.trim() === '') {
      return res.status(400).json({ error: 'Store Name is required' });
    }
    
    if (!contactNumber1 || contactNumber1.trim() === '') {
      return res.status(400).json({ error: 'Contact Number 1 is required' });
    }
    
    if (!address || address.trim() === '') {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    // UPI ID is now optional (disabled)
    // if (!upiId || upiId.trim() === '') {
    //   return res.status(400).json({ error: 'UPI ID is required' });
    // }
    
    const storeDetails = {
      storeName: storeName.trim(),
      contactNumber1: contactNumber1.trim(),
      contactNumber2: (contactNumber2 || '').trim(),
      email: (email || '').trim(),
      address: address.trim(),
      gstin: (gstin || '').trim(),
      upiId: (upiId || '').trim(), // UPI ID is optional (disabled)
      instructions: (instructions || '').trim(),
      isLive: isLive === true || isLive === 'true' || false,
      updatedAt: new Date().toISOString()
    };
    
    const updatedDetails = await updateStoreDetails(storeDetails, req.user.id);
    res.json({ success: true, payment: updatedDetails });
  } catch (error) {
    console.error('Error saving store details:', error);
    res.status(500).json({ error: 'Error saving store details: ' + error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

