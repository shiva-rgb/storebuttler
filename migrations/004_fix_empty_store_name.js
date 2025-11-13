/**
 * Fix orders with empty store_name
 * 
 * Usage: node migrations/004_fix_empty_store_name.js
 * 
 * This script updates any orders that have NULL or empty store_name
 * by setting them to the store_name from store_details
 */

require('dotenv').config();
const pool = require('../config/db');

async function fixEmptyStoreName() {
  console.log('Fixing orders with empty store_name...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First, check if store_details exists and has a store_name
    const storeCheck = await client.query(
      'SELECT store_name FROM store_details ORDER BY id LIMIT 1'
    );

    if (storeCheck.rows.length === 0 || !storeCheck.rows[0].store_name) {
      console.log('⚠ No store details found. Please set up store details first.');
      console.log('  You can do this through the admin dashboard.');
      await client.query('ROLLBACK');
      return;
    }

    const storeName = storeCheck.rows[0].store_name;
    console.log(`Using store name: ${storeName}\n`);

    // Count orders with empty store_name
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM orders 
       WHERE store_name IS NULL OR store_name = ''`
    );
    const countToUpdate = parseInt(countResult.rows[0].count);

    if (countToUpdate === 0) {
      console.log('✓ No orders with empty store_name found. All orders are already updated.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Found ${countToUpdate} order(s) with empty store_name`);

    // Update orders with empty store_name
    const updateResult = await client.query(
      `UPDATE orders 
       SET store_name = $1
       WHERE (store_name IS NULL OR store_name = '')`,
      [storeName]
    );

    await client.query('COMMIT');

    console.log(`✓ Successfully updated ${updateResult.rowCount} order(s) with store_name: ${storeName}`);
    console.log('\nFix completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Error fixing orders:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run the fix
fixEmptyStoreName()
  .then(() => {
    console.log('');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Fix failed:', error);
    process.exit(1);
  });

