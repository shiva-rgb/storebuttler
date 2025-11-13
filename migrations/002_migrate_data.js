/**
 * Migration script to migrate existing JSON data to PostgreSQL database
 * 
 * Usage: node migrations/002_migrate_data.js
 * 
 * This script will:
 * 1. Read existing JSON files (inventory.json, orders.json, payment.json)
 * 2. Insert the data into PostgreSQL database
 * 3. Preserve all existing data
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  bulkInsertProducts,
  createOrder,
  updateStoreDetails
} = require('../db/queries');

async function migrateData() {
  console.log('Starting data migration...\n');

  const dataDir = path.join(__dirname, '..', 'data');

  // Migrate Products
  try {
    const inventoryPath = path.join(dataDir, 'inventory.json');
    if (fs.existsSync(inventoryPath)) {
      console.log('Migrating products...');
      const inventoryData = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
      
      if (Array.isArray(inventoryData) && inventoryData.length > 0) {
        // Convert createdAt string to ISO format if needed
        const products = inventoryData.map(product => ({
          ...product,
          createdAt: product.createdAt || product.created_at || new Date().toISOString()
        }));
        
        await bulkInsertProducts(products);
        console.log(`✓ Migrated ${products.length} products\n`);
      } else {
        console.log('⚠ No products to migrate\n');
      }
    } else {
      console.log('⚠ inventory.json not found, skipping products migration\n');
    }
  } catch (error) {
    console.error('✗ Error migrating products:', error.message);
    console.error('  Continuing with other migrations...\n');
  }

  // Migrate Orders
  try {
    const ordersPath = path.join(dataDir, 'orders.json');
    if (fs.existsSync(ordersPath)) {
      console.log('Migrating orders...');
      const ordersData = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
      
      if (Array.isArray(ordersData) && ordersData.length > 0) {
        let migratedCount = 0;
        let skippedCount = 0;

        for (const order of ordersData) {
          try {
            // Ensure order has required fields
            if (!order.id || !order.customerInfo || !order.items) {
              console.log(`  ⚠ Skipping order ${order.id || 'unknown'}: missing required fields`);
              skippedCount++;
              continue;
            }

            // Convert customerInfo structure if needed
            const customerInfo = order.customerInfo || {};
            
            // Ensure items have productId
            const items = order.items.map(item => ({
              productId: item.productId,
              quantity: item.quantity
            })).filter(item => item.productId);

            if (items.length === 0) {
              console.log(`  ⚠ Skipping order ${order.id}: no valid items`);
              skippedCount++;
              continue;
            }

            const orderData = {
              id: order.id,
              items: items,
              customerInfo: {
                name: customerInfo.name || '',
                email: customerInfo.email || '',
                phone: customerInfo.phone || '',
                address: customerInfo.address || ''
              },
              status: order.status || 'pending',
              total: order.total || 0,
              createdAt: order.createdAt || order.created_at || new Date().toISOString()
            };

            await createOrder(orderData);
            migratedCount++;
          } catch (error) {
            console.log(`  ⚠ Error migrating order ${order.id || 'unknown'}: ${error.message}`);
            skippedCount++;
          }
        }

        console.log(`✓ Migrated ${migratedCount} orders`);
        if (skippedCount > 0) {
          console.log(`  ⚠ Skipped ${skippedCount} orders due to errors\n`);
        } else {
          console.log('');
        }
      } else {
        console.log('⚠ No orders to migrate\n');
      }
    } else {
      console.log('⚠ orders.json not found, skipping orders migration\n');
    }
  } catch (error) {
    console.error('✗ Error migrating orders:', error.message);
    console.error('  Continuing with other migrations...\n');
  }

  // Migrate Store Details
  try {
    const paymentPath = path.join(dataDir, 'payment.json');
    if (fs.existsSync(paymentPath)) {
      console.log('Migrating store details...');
      const paymentData = JSON.parse(fs.readFileSync(paymentPath, 'utf8'));
      
      if (paymentData && Object.keys(paymentData).length > 0) {
        const storeDetails = {
          storeName: paymentData.storeName || '',
          contactNumber1: paymentData.contactNumber1 || paymentData.contact_number_1 || '',
          contactNumber2: paymentData.contactNumber2 || paymentData.contact_number_2 || '',
          address: paymentData.address || '',
          gstin: paymentData.gstin || '',
          upiId: paymentData.upiId || paymentData.upi_id || '',
          instructions: paymentData.instructions || '',
          updatedAt: paymentData.updatedAt || paymentData.updated_at || new Date().toISOString()
        };

        // Only migrate if there's meaningful data
        if (storeDetails.storeName || storeDetails.contactNumber1 || storeDetails.upiId) {
          await updateStoreDetails(storeDetails);
          console.log('✓ Migrated store details\n');
        } else {
          console.log('⚠ No meaningful store details to migrate\n');
        }
      } else {
        console.log('⚠ No store details to migrate\n');
      }
    } else {
      console.log('⚠ payment.json not found, skipping store details migration\n');
    }
  } catch (error) {
    console.error('✗ Error migrating store details:', error.message);
    console.error('  Migration completed with errors\n');
  }

  console.log('Data migration completed!');
  console.log('\nNote: Original JSON files are preserved in the data/ directory.');
  console.log('You can delete them after verifying the migration was successful.');
}

// Run migration
migrateData()
  .then(() => {
    console.log('\n✓ All migrations completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  });

