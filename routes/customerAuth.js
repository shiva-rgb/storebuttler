const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken, normalizePhone, validatePassword } = require('../config/auth');
const {
  createCustomer,
  getCustomerByPhone,
  getCustomerById
} = require('../db/queries');
const { authenticateCustomer } = require('../middleware/customerAuth');

const router = express.Router();

/**
 * POST /api/customer-auth/signup
 * Customer registration
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    // Validate inputs
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format. Please use format: +91XXXXXXXXXX or 10-digit number' });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    // Check if customer already exists
    const existingCustomer = await getCustomerByPhone(normalizedPhone);
    if (existingCustomer) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create customer
    const customer = await createCustomer(name, normalizedPhone, passwordHash);

    // Generate JWT token with customerId in payload
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign({ customerId: customer.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set httpOnly cookie with different name
    res.cookie('customerToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return customer info (without password)
    res.status(201).json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('Error in customer signup:', error);
    res.status(500).json({ error: 'Error creating account. Please try again.' });
  }
});

/**
 * POST /api/customer-auth/login
 * Customer login
 */
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Find customer by phone
    const customer = await getCustomerByPhone(normalizedPhone);
    if (!customer) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, customer.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Generate JWT token with customerId in payload
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign({ customerId: customer.id }, JWT_SECRET, { expiresIn: '7d' });

    // Set httpOnly cookie
    res.cookie('customerToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return customer info
    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('Error in customer login:', error);
    res.status(500).json({ error: 'Error logging in. Please try again.' });
  }
});

/**
 * POST /api/customer-auth/logout
 * Customer logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('customerToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/customer-auth/me
 * Get current customer
 */
router.get('/me', authenticateCustomer, async (req, res) => {
  try {
    const customer = await getCustomerById(req.customer.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: 'Error fetching customer information' });
  }
});

module.exports = router;

