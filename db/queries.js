const pool = require('../config/db');

// Note: getCurrentStoreName() removed - now using user_id from authentication

// Helper function to convert database row to frontend format
function transformProduct(row) {
  if (!row) return null;
  
  // Ensure price is always a number (PostgreSQL DECIMAL can return as string)
  let price = 0;
  if (row.price !== null && row.price !== undefined) {
    price = typeof row.price === 'string' ? parseFloat(row.price) : Number(row.price);
    if (isNaN(price)) price = 0;
  }
  
  // Ensure quantity is always a number
  let quantity = 0;
  if (row.quantity !== null && row.quantity !== undefined) {
    quantity = typeof row.quantity === 'string' ? parseInt(row.quantity) : Number(row.quantity);
    if (isNaN(quantity)) quantity = 0;
  }
  
  return {
    id: row.id,
    name: row.name || '',
    price: price,
    quantity: quantity,
    unit: row.unit || '',
    category: row.category || 'Uncategorized',
    description: row.description || '',
    image: row.image || '',
    createdAt: row.created_at ? row.created_at.toISOString() : (row.createdAt || new Date().toISOString())
  };
}

// ==================== PRODUCT QUERIES ====================

/**
 * Get all products (filtered by user_id)
 */
async function getAllProducts(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await pool.query(
      'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map(transformProduct);
  } catch (error) {
    console.error('Error getting all products:', error);
    throw error;
  }
}

/**
 * Get product by ID (filtered by user_id)
 */
async function getProductById(id, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return transformProduct(result.rows[0]) || null;
  } catch (error) {
    console.error('Error getting product by ID:', error);
    throw error;
  }
}

/**
 * Create a new product (linked to user_id)
 */
async function createProduct(product, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const {
      id,
      name,
      price,
      quantity,
      unit = '',
      category = 'Uncategorized',
      description = '',
      image = '',
      createdAt = new Date().toISOString()
    } = product;

    const result = await pool.query(
      `INSERT INTO products (id, name, price, quantity, unit, category, description, image, created_at, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, name, price, quantity, unit, category, description, image, createdAt, userId]
    );
    return transformProduct(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
}

/**
 * Update a product (filtered by user_id)
 */
async function updateProduct(id, updates, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map camelCase to snake_case for database columns
    const fieldMap = {
      'name': 'name',
      'price': 'price',
      'quantity': 'quantity',
      'unit': 'unit',
      'category': 'category',
      'description': 'description',
      'image': 'image',
      'createdAt': 'created_at'
    };

    // Build dynamic update query
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined && fieldMap[key]) {
        const dbField = fieldMap[key];
        fields.push(`${dbField} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return await getProductById(id, userId);
    }

    values.push(id, userId);
    const query = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`;
    
    const result = await pool.query(query, values);
    return transformProduct(result.rows[0]) || null;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
}

/**
 * Delete a product (filtered by user_id)
 */
async function deleteProduct(id, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
}

/**
 * Bulk insert products (for Excel/CSV upload, linked to user_id)
 */
async function bulkInsertProducts(products, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    // Insert products one by one (could be optimized with COPY for large datasets)
    const insertedProducts = [];
    for (const product of products) {
      const {
        id,
        name,
        price,
        quantity,
        unit = '',
        category = 'Uncategorized',
        description = '',
        image = '',
        createdAt = new Date().toISOString()
      } = product;

      const result = await client.query(
        `INSERT INTO products (id, name, price, quantity, unit, category, description, image, created_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           quantity = EXCLUDED.quantity,
           unit = EXCLUDED.unit,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           image = EXCLUDED.image,
           user_id = EXCLUDED.user_id
         RETURNING *`,
        [id, name, price, quantity, unit, category, description, image, createdAt, userId]
      );
      insertedProducts.push(transformProduct(result.rows[0]));
    }
    
    await client.query('COMMIT');
    return insertedProducts;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bulk inserting products:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== ORDER QUERIES ====================

/**
 * Get all orders with their items (filtered by user_id)
 */
async function getAllOrders(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    // Get all orders for current user
    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    const orders = ordersResult.rows;

    // Get all order items
    const itemsResult = await pool.query('SELECT * FROM order_items ORDER BY id');
    const itemsByOrderId = {};
    
    itemsResult.rows.forEach(item => {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push({
        productId: item.product_id,
        quantity: item.quantity,
        productName: item.product_name,
        productPrice: parseFloat(item.product_price)
      });
    });

    // Combine orders with their items
    return orders.map(order => ({
      id: order.id,
      items: itemsByOrderId[order.id] || [],
      customerInfo: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        address: order.customer_address
      },
      status: order.status,
      createdAt: order.created_at.toISOString(),
      total: parseFloat(order.total),
      paymentMethod: order.payment_method || 'cod',
      paymentStatus: order.payment_status || 'pending',
      razorpayPaymentId: order.razorpay_payment_id,
      razorpayOrderId: order.razorpay_order_id,
      razorpaySignature: order.razorpay_signature
    }));
  } catch (error) {
    console.error('Error getting all orders:', error);
    throw error;
  }
}

/**
 * Generate a new order ID in format: yyyymmdd<orderid>
 * Example: 2025111801 (2025-11-18, order #01)
 * @returns {Promise<string>} - Generated order ID
 */
async function generateOrderId() {
  try {
    // Get today's date in yyyymmdd format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;
    
    // Find all order IDs that start with today's date prefix
    const result = await pool.query(
      `SELECT id FROM orders WHERE id LIKE $1 ORDER BY id DESC LIMIT 100`,
      [`${datePrefix}%`]
    );
    
    // Extract sequential numbers from existing order IDs
    let maxSequence = 0;
    result.rows.forEach(row => {
      const orderId = row.id;
      // Extract the sequence number (everything after the date prefix)
      if (orderId.startsWith(datePrefix)) {
        const sequenceStr = orderId.substring(datePrefix.length);
        const sequence = parseInt(sequenceStr, 10);
        if (!isNaN(sequence) && sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    });
    
    // Increment and pad to 2 digits
    const nextSequence = maxSequence + 1;
    const sequenceStr = String(nextSequence).padStart(2, '0');
    
    return `${datePrefix}${sequenceStr}`;
  } catch (error) {
    console.error('Error generating order ID:', error);
    // Fallback: use timestamp-based ID if there's an error
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = Date.now().toString().slice(-2); // Last 2 digits of timestamp
    return `${year}${month}${day}${timestamp}`;
  }
}

/**
 * Create a new order with items (transaction, linked to user_id)
 * Note: For customer orders, we need to find the user_id from the products
 * @param {Object} orderData - Order data including items, customerInfo, etc.
 * @param {number} userId - Store owner user ID (optional, will be derived from products if not provided)
 * @param {number} customerId - Customer ID if customer is logged in (optional, null for guest orders)
 */
async function createOrder(orderData, userId = null, customerId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { 
      id, 
      items, 
      customerInfo, 
      status = 'pending', 
      total, 
      createdAt = new Date().toISOString(),
      paymentMethod = 'cod',
      paymentStatus = 'pending',
      razorpayPaymentId = null,
      razorpayOrderId = null,
      razorpaySignature = null
    } = orderData;

    // If userId not provided, get it from the first product
    let orderUserId = userId;
    if (!orderUserId && items.length > 0) {
      const firstProduct = await client.query('SELECT user_id FROM products WHERE id = $1', [items[0].productId]);
      if (firstProduct.rows.length === 0) {
        throw new Error(`Product ${items[0].productId} not found`);
      }
      orderUserId = firstProduct.rows[0].user_id;
    }

    if (!orderUserId) {
      throw new Error('Unable to determine store owner for this order');
    }

    // Validate and update inventory quantities (only for products from this user's store)
    for (const item of items) {
      const product = await client.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [item.productId, orderUserId]);
      if (product.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found for this store`);
      }
      if (product.rows[0].quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.rows[0].name}`);
      }
      // Update inventory
      await client.query(
        'UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND user_id = $3',
        [item.quantity, item.productId, orderUserId]
      );
    }

    // Insert order
    await client.query(
      `INSERT INTO orders (id, customer_name, customer_email, customer_phone, customer_address, status, total, created_at, user_id, customer_id, payment_method, payment_status, razorpay_payment_id, razorpay_order_id, razorpay_signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        customerInfo.name,
        customerInfo.email,
        customerInfo.phone,
        customerInfo.address,
        status,
        total,
        createdAt,
        orderUserId,
        customerId, // NULL for guest orders, customer ID for logged-in customers
        paymentMethod,
        paymentStatus,
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature
      ]
    );

    // Get product details for order items (only from this user's store)
    const productDetails = {};
    for (const item of items) {
      const product = await client.query('SELECT name, price FROM products WHERE id = $1 AND user_id = $2', [item.productId, orderUserId]);
      if (product.rows.length > 0) {
        productDetails[item.productId] = {
          name: product.rows[0].name,
          price: product.rows[0].price
        };
      }
    }

    // Insert order items
    for (const item of items) {
      const productInfo = productDetails[item.productId] || { name: 'Unknown Product', price: 0 };
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, product_name, product_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, item.productId, item.quantity, productInfo.name, productInfo.price]
      );
    }

    await client.query('COMMIT');

    // Return the created order
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    const itemsResult = await client.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [id]
    );

    return {
      id: orderResult.rows[0].id,
      items: itemsResult.rows.map(item => ({
        productId: item.product_id,
        quantity: item.quantity,
        productName: item.product_name,
        productPrice: parseFloat(item.product_price)
      })),
      customerInfo: {
        name: orderResult.rows[0].customer_name,
        email: orderResult.rows[0].customer_email,
        phone: orderResult.rows[0].customer_phone,
        address: orderResult.rows[0].customer_address
      },
      status: orderResult.rows[0].status,
      createdAt: orderResult.rows[0].created_at.toISOString(),
      total: parseFloat(orderResult.rows[0].total),
      paymentMethod: orderResult.rows[0].payment_method || 'cod',
      paymentStatus: orderResult.rows[0].payment_status || 'pending',
      razorpayPaymentId: orderResult.rows[0].razorpay_payment_id,
      razorpayOrderId: orderResult.rows[0].razorpay_order_id,
      razorpaySignature: orderResult.rows[0].razorpay_signature
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update order payment status and Razorpay details
 */
async function updateOrderPaymentStatus(orderId, paymentData) {
  try {
    const {
      paymentStatus,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature
    } = paymentData;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (paymentStatus !== undefined) {
      fields.push(`payment_status = $${paramCount++}`);
      values.push(paymentStatus);
    }
    if (razorpayPaymentId !== undefined) {
      fields.push(`razorpay_payment_id = $${paramCount++}`);
      values.push(razorpayPaymentId);
    }
    if (razorpayOrderId !== undefined) {
      fields.push(`razorpay_order_id = $${paramCount++}`);
      values.push(razorpayOrderId);
    }
    if (razorpaySignature !== undefined) {
      fields.push(`razorpay_signature = $${paramCount++}`);
      values.push(razorpaySignature);
    }

    if (fields.length === 0) {
      throw new Error('No payment data provided to update');
    }

    values.push(orderId);

    const result = await pool.query(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      paymentMethod: result.rows[0].payment_method,
      paymentStatus: result.rows[0].payment_status,
      razorpayPaymentId: result.rows[0].razorpay_payment_id,
      razorpayOrderId: result.rows[0].razorpay_order_id
    };
  } catch (error) {
    console.error('Error updating order payment status:', error);
    throw error;
  }
}

/**
 * Update order status (filtered by user_id)
 */
async function updateOrderStatus(id, updates, userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      // If no updates, just return the order if it exists for this user
      const orderResult = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (orderResult.rows.length === 0) {
        return null;
      }
      const order = orderResult.rows[0];
      const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
      return {
        id: order.id,
        items: itemsResult.rows.map(item => ({
          productId: item.product_id,
          quantity: item.quantity,
          productName: item.product_name,
          productPrice: parseFloat(item.product_price)
        })),
        customerInfo: {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
          address: order.customer_address
        },
        status: order.status,
        createdAt: order.created_at.toISOString(),
        total: parseFloat(order.total)
      };
    }

    values.push(id, userId);
    const query = `UPDATE orders SET ${fields.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`;
    
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return null;
    }

    // Get order items
    const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
    
    return {
      id: result.rows[0].id,
      items: itemsResult.rows.map(item => ({
        productId: item.product_id,
        quantity: item.quantity,
        productName: item.product_name,
        productPrice: parseFloat(item.product_price)
      })),
      customerInfo: {
        name: result.rows[0].customer_name,
        email: result.rows[0].customer_email,
        phone: result.rows[0].customer_phone,
        address: result.rows[0].customer_address
      },
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at.toISOString(),
      total: parseFloat(result.rows[0].total)
    };
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
}

// ==================== STORE DETAILS QUERIES ====================

/**
 * Get store details by store name slug (for public access)
 */
async function getStoreDetailsBySlug(storeSlug) {
  try {
    // Find store by matching slugified store_name
    // Create a slug from store_name and compare
    const result = await pool.query(
      `SELECT * FROM store_details 
       WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(store_name, ' ', '-'), '_', '-'), '.', ''), '/', '-')) = $1 
       OR LOWER(store_name) LIKE $2
       ORDER BY id LIMIT 1`,
      [storeSlug.toLowerCase(), `%${storeSlug.toLowerCase()}%`]
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      operating_schedule_start_time: row.operating_schedule_start_time ? row.operating_schedule_start_time.substring(0, 5) : null,
      operating_schedule_end_time: row.operating_schedule_end_time ? row.operating_schedule_end_time.substring(0, 5) : null
    };
  } catch (error) {
    console.error('Error getting store details by slug:', error);
    throw error;
  }
}

/**
 * Get products by user_id (public endpoint for customers)
 */
async function getProductsByUserId(userId) {
  try {
    if (!userId) {
      return [];
    }
    
    const result = await pool.query(
      'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map(transformProduct);
  } catch (error) {
    console.error('Error getting products by user ID:', error);
    throw error;
  }
}

/**
 * Get store details (filtered by user_id)
 */
async function getStoreDetails(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const result = await pool.query(
      'SELECT * FROM store_details WHERE user_id = $1 ORDER BY id LIMIT 1',
      [userId]
    );
    if (result.rows.length === 0) {
      return {
        storeName: '',
        contactNumber1: '',
        contactNumber2: '',
        email: '',
        address: '',
        instructions: '',
      minimumOrderValue: null,
      isLive: false,
      onlinePaymentEnabled: false,
      razorpayKeyId: null,
      operatingScheduleEnabled: false,
      operatingScheduleDays: null,
      operatingScheduleStartTime: null,
      operatingScheduleEndTime: null,
      operatingScheduleTimezone: 'Asia/Kolkata',
      updatedAt: null
    };
  }
  
  const row = result.rows[0];
  return {
    storeName: row.store_name || '',
    contactNumber1: row.contact_number_1 || '',
    contactNumber2: row.contact_number_2 || '',
    email: row.email || '',
    address: row.address || '',
    instructions: row.instructions || '',
    minimumOrderValue: row.minimum_order_value !== null && row.minimum_order_value !== undefined ? parseFloat(row.minimum_order_value) : null,
    isLive: row.is_live || false,
    onlinePaymentEnabled: row.online_payment_enabled || false,
    razorpayKeyId: row.razorpay_key_id || null,
    operatingScheduleEnabled: row.operating_schedule_enabled || false,
    operatingScheduleDays: row.operating_schedule_days || null,
    operatingScheduleStartTime: row.operating_schedule_start_time ? row.operating_schedule_start_time.substring(0, 5) : null, // Return HH:MM format
    operatingScheduleEndTime: row.operating_schedule_end_time ? row.operating_schedule_end_time.substring(0, 5) : null, // Return HH:MM format
    operatingScheduleTimezone: row.operating_schedule_timezone || 'Asia/Kolkata',
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null
  };
  } catch (error) {
    console.error('Error getting store details:', error);
    throw error;
  }
}

/**
 * Update store details (UPSERT - insert or update, filtered by user_id)
 */
async function updateStoreDetails(details, userId, keepExistingSecret = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (!userId) {
      throw new Error('User ID is required');
    }

    const {
      storeName,
      contactNumber1,
      contactNumber2 = '',
      email = '',
      address,
      instructions = '',
      minimumOrderValue = null,
      isLive = false,
      onlinePaymentEnabled = false,
      razorpayKeyId = null,
      razorpayKeySecret = null,
      operatingScheduleEnabled = false,
      operatingScheduleDays = null,
      operatingScheduleStartTime = null,
      operatingScheduleEndTime = null,
      operatingScheduleTimezone = 'Asia/Kolkata',
      updatedAt = new Date().toISOString()
    } = details;

    // Check if store details already exist for this user
    const existing = await client.query(
      'SELECT id FROM store_details WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    
    let result;
    if (existing.rows.length === 0) {
      // Insert new record
      result = await client.query(
        `INSERT INTO store_details (store_name, contact_number_1, contact_number_2, email, address, instructions, minimum_order_value, updated_at, user_id, is_live, online_payment_enabled, razorpay_key_id, razorpay_key_secret, operating_schedule_enabled, operating_schedule_days, operating_schedule_start_time, operating_schedule_end_time, operating_schedule_timezone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [storeName, contactNumber1, contactNumber2, email, address, instructions, minimumOrderValue, updatedAt, userId, isLive, onlinePaymentEnabled, razorpayKeyId, razorpayKeySecret, operatingScheduleEnabled, operatingScheduleDays ? JSON.stringify(operatingScheduleDays) : null, operatingScheduleStartTime, operatingScheduleEndTime, operatingScheduleTimezone]
      );
    } else {
      // Update existing record - only update bank details if they are provided
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;
      
      // Always update these fields
      updateFields.push(`store_name = $${paramCount++}`);
      updateValues.push(storeName);
      updateFields.push(`contact_number_1 = $${paramCount++}`);
      updateValues.push(contactNumber1);
      updateFields.push(`contact_number_2 = $${paramCount++}`);
      updateValues.push(contactNumber2);
      updateFields.push(`email = $${paramCount++}`);
      updateValues.push(email);
      updateFields.push(`address = $${paramCount++}`);
      updateValues.push(address);
      updateFields.push(`instructions = $${paramCount++}`);
      updateValues.push(instructions);
      // Update minimum_order_value if provided (including null to clear it)
      if (minimumOrderValue !== undefined) {
        updateFields.push(`minimum_order_value = $${paramCount++}`);
        updateValues.push(minimumOrderValue);
      }
      updateFields.push(`updated_at = $${paramCount++}`);
      updateValues.push(updatedAt);
      updateFields.push(`is_live = $${paramCount++}`);
      updateValues.push(isLive);
      
      if (onlinePaymentEnabled !== undefined) {
        updateFields.push(`online_payment_enabled = $${paramCount++}`);
        updateValues.push(onlinePaymentEnabled);
      }
      if (razorpayKeyId !== undefined && razorpayKeyId !== null) {
        updateFields.push(`razorpay_key_id = $${paramCount++}`);
        updateValues.push(razorpayKeyId);
      }
      // Only update key_secret if keepExistingSecret is false and a new secret is provided
      if (!keepExistingSecret && razorpayKeySecret !== undefined && razorpayKeySecret !== null) {
        updateFields.push(`razorpay_key_secret = $${paramCount++}`);
        updateValues.push(razorpayKeySecret);
      }
      
      // Update operating schedule fields if provided
      if (operatingScheduleEnabled !== undefined) {
        updateFields.push(`operating_schedule_enabled = $${paramCount++}`);
        updateValues.push(operatingScheduleEnabled);
      }
      if (operatingScheduleDays !== undefined) {
        updateFields.push(`operating_schedule_days = $${paramCount++}`);
        updateValues.push(operatingScheduleDays ? JSON.stringify(operatingScheduleDays) : null);
      }
      if (operatingScheduleStartTime !== undefined) {
        updateFields.push(`operating_schedule_start_time = $${paramCount++}`);
        updateValues.push(operatingScheduleStartTime);
      }
      if (operatingScheduleEndTime !== undefined) {
        updateFields.push(`operating_schedule_end_time = $${paramCount++}`);
        updateValues.push(operatingScheduleEndTime);
      }
      if (operatingScheduleTimezone !== undefined) {
        updateFields.push(`operating_schedule_timezone = $${paramCount++}`);
        updateValues.push(operatingScheduleTimezone);
      }
      
      updateValues.push(userId);
      
      result = await client.query(
        `UPDATE store_details SET
           ${updateFields.join(', ')}
         WHERE user_id = $${paramCount}
         RETURNING *`,
        updateValues
      );
    }

    await client.query('COMMIT');

    const row = result.rows[0];
    return {
      storeName: row.store_name || '',
      contactNumber1: row.contact_number_1 || '',
      contactNumber2: row.contact_number_2 || '',
      email: row.email || '',
      address: row.address || '',
      instructions: row.instructions || '',
      minimumOrderValue: row.minimum_order_value !== null && row.minimum_order_value !== undefined ? parseFloat(row.minimum_order_value) : null,
      isLive: row.is_live || false,
      onlinePaymentEnabled: row.online_payment_enabled || false,
      razorpayKeyId: row.razorpay_key_id || null,
      operatingScheduleEnabled: row.operating_schedule_enabled || false,
      operatingScheduleDays: row.operating_schedule_days || null,
      operatingScheduleStartTime: row.operating_schedule_start_time ? row.operating_schedule_start_time.substring(0, 5) : null,
      operatingScheduleEndTime: row.operating_schedule_end_time ? row.operating_schedule_end_time.substring(0, 5) : null,
      operatingScheduleTimezone: row.operating_schedule_timezone || 'Asia/Kolkata',
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating store details:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== USER QUERIES ====================

/**
 * Create a new user
 */
async function createUser(email, phone, passwordHash) {
  try {
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, phone, is_verified, created_at`,
      [email, phone, passwordHash]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
}

/**
 * Get user by phone (normalized)
 */
async function getUserByPhone(phone) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by phone:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
async function getUserById(id) {
  try {
    const result = await pool.query(
      'SELECT id, email, phone, is_verified, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Update user password
 */
async function updateUserPassword(userId, passwordHash) {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, phone`,
      [passwordHash, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating user password:', error);
    throw error;
  }
}

/**
 * Set password reset token
 */
async function setResetToken(userId, token, expiry) {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET reset_token = $1, reset_token_expiry = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id`,
      [token, expiry, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error setting reset token:', error);
    throw error;
  }
}

/**
 * Get user by reset token
 */
async function getUserByResetToken(token) {
  try {
    const result = await pool.query(
      `SELECT * FROM users 
       WHERE reset_token = $1 
       AND reset_token_expiry > CURRENT_TIMESTAMP`,
      [token]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by reset token:', error);
    throw error;
  }
}

/**
 * Clear reset token after use
 */
async function clearResetToken(userId) {
  try {
    await pool.query(
      `UPDATE users 
       SET reset_token = NULL, reset_token_expiry = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );
    return true;
  } catch (error) {
    console.error('Error clearing reset token:', error);
    throw error;
  }
}

// ==================== CUSTOMER QUERIES ====================

/**
 * Create a new customer
 */
async function createCustomer(name, phone, passwordHash) {
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, phone, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, phone, created_at`,
      [name, phone, passwordHash]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
}

/**
 * Get customer by phone
 */
async function getCustomerByPhone(phone) {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE phone = $1',
      [phone]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting customer by phone:', error);
    throw error;
  }
}

/**
 * Get customer by ID
 */
async function getCustomerById(id) {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, created_at FROM customers WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting customer by ID:', error);
    throw error;
  }
}

/**
 * Get all orders for a customer (filtered by store owner's user_id for admin)
 */
async function getCustomerOrdersForAdmin(customerId, userId) {
  try {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    // Get all orders for this customer that belong to this store owner
    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE customer_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [customerId, userId]
    );
    const orders = ordersResult.rows;
    
    // Get all order items
    const orderIds = orders.map(o => o.id);
    if (orderIds.length === 0) {
      return [];
    }

    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id',
      [orderIds]
    );
    const itemsByOrderId = {};
    
    itemsResult.rows.forEach(item => {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push({
        productId: item.product_id,
        quantity: item.quantity,
        productName: item.product_name,
        productPrice: parseFloat(item.product_price)
      });
    });

    // Combine orders with their items
    return orders.map(order => ({
      id: order.id,
      items: itemsByOrderId[order.id] || [],
      customerInfo: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        address: order.customer_address
      },
      status: order.status,
      createdAt: order.created_at.toISOString(),
      total: parseFloat(order.total),
      paymentMethod: order.payment_method || 'cod',
      paymentStatus: order.payment_status || 'pending',
      razorpayPaymentId: order.razorpay_payment_id || null
    }));
  } catch (error) {
    console.error('Error getting customer orders for admin:', error);
    throw error;
  }
}

/**
 * Get all orders for a customer
 */
async function getCustomerOrders(customerId) {
  try {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }
    
    // Get all orders for this customer
    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC',
      [customerId]
    );
    const orders = ordersResult.rows;

    // Get all order items
    const orderIds = orders.map(o => o.id);
    if (orderIds.length === 0) {
      return [];
    }

    const itemsResult = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id',
      [orderIds]
    );
    const itemsByOrderId = {};
    
    itemsResult.rows.forEach(item => {
      if (!itemsByOrderId[item.order_id]) {
        itemsByOrderId[item.order_id] = [];
      }
      itemsByOrderId[item.order_id].push({
        productId: item.product_id,
        quantity: item.quantity,
        productName: item.product_name,
        productPrice: parseFloat(item.product_price)
      });
    });

    // Combine orders with their items
    return orders.map(order => ({
      id: order.id,
      items: itemsByOrderId[order.id] || [],
      customerInfo: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        address: order.customer_address
      },
      status: order.status,
      createdAt: order.created_at.toISOString(),
      total: parseFloat(order.total),
      paymentMethod: order.payment_method || 'cod',
      paymentStatus: order.payment_status || 'paid',
      razorpayPaymentId: order.razorpay_payment_id || null
    }));
  } catch (error) {
    console.error('Error getting customer orders:', error);
    throw error;
  }
}

/**
 * Get all customers (for admin)
 */
async function getAllCustomers() {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, created_at FROM customers ORDER BY created_at DESC'
    );
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      registrationDate: row.created_at.toISOString()
    }));
  } catch (error) {
    console.error('Error getting all customers:', error);
    throw error;
  }
}

/**
 * Check if store is currently operating based on schedule
 * @param {object} storeDetails - Store details object with operating schedule fields
 * @returns {boolean} - True if store is operating, false otherwise
 */
function isStoreOperatingNow(storeDetails) {
  // If schedule is not enabled, fall back to isLive
  if (!storeDetails.operatingScheduleEnabled) {
    return storeDetails.isLive || false;
  }
  
  // If schedule is enabled but days/times are not set, return false
  if (!storeDetails.operatingScheduleDays || 
      !storeDetails.operatingScheduleStartTime || 
      !storeDetails.operatingScheduleEndTime) {
    return false;
  }
  
  // Get current time in IST (UTC+5:30)
  const now = new Date();
  // Convert to IST: UTC + 5:30 hours
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  
  // Get current day in IST (0=Sunday, 1=Monday, etc.)
  // Use UTC methods since we've already adjusted for IST offset
  const currentDay = istTime.getUTCDay();
  
  // Parse operating schedule days (should be array of day numbers)
  let operatingDays = [];
  if (Array.isArray(storeDetails.operatingScheduleDays)) {
    operatingDays = storeDetails.operatingScheduleDays;
  } else if (typeof storeDetails.operatingScheduleDays === 'string') {
    try {
      operatingDays = JSON.parse(storeDetails.operatingScheduleDays);
    } catch (e) {
      console.error('Error parsing operating schedule days:', e);
      return false;
    }
  }
  
  // Check if today is in operating days
  if (!operatingDays.includes(currentDay)) {
    return false;
  }
  
  // Get current time in minutes since midnight (IST)
  // Use UTC methods since we've already adjusted the timestamp for IST
  const currentHours = istTime.getUTCHours();
  const currentMinutes = istTime.getUTCMinutes();
  const currentTime = currentHours * 60 + currentMinutes;
  
  // Parse start and end times (HH:MM format)
  const [startHour, startMin] = storeDetails.operatingScheduleStartTime.split(':').map(Number);
  const [endHour, endMin] = storeDetails.operatingScheduleEndTime.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  // Check if current time is within operating hours
  return currentTime >= startTime && currentTime < endTime;
}

module.exports = {
  generateOrderId,
  // Product functions
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkInsertProducts,
  
  // Order functions
  getAllOrders,
  createOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  
  // Store details functions
  getStoreDetails,
  getStoreDetailsBySlug,
  updateStoreDetails,
  getProductsByUserId,
  
  // User functions
  createUser,
  getUserByEmail,
  getUserByPhone,
  getUserById,
  updateUserPassword,
  setResetToken,
  getUserByResetToken,
  clearResetToken,
  
  // Customer functions
  createCustomer,
  getCustomerByPhone,
  getCustomerById,
  getCustomerOrders,
  getCustomerOrdersForAdmin,
  getAllCustomers,
  isStoreOperatingNow
};

