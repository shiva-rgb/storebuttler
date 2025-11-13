const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken, normalizePhone, validateEmail, validatePassword } = require('../config/auth');
const {
  createUser,
  getUserByEmail,
  getUserByPhone,
  getUserById,
  updateUserPassword,
  setResetToken,
  getUserByResetToken,
  clearResetToken
} = require('../db/queries');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/signup
 * User registration
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Validate inputs
    if (!email || !phone || !password) {
      return res.status(400).json({ error: 'Email, phone, and password are required' });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
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

    // Check if user already exists
    const existingByEmail = await getUserByEmail(email);
    if (existingByEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingByPhone = await getUserByPhone(normalizedPhone);
    if (existingByPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await createUser(email, normalizedPhone, passwordHash);

    // Generate JWT token
    const token = generateToken(user.id);

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user info (without password)
    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Error in signup:', error);
    res.status(500).json({ error: 'Error creating account. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * User login
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

    // Find user by phone
    const user = await getUserByPhone(normalizedPhone);
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user info
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Error logging in. Please try again.' });
  }
});

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Error fetching user information' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }

    let user = null;
    if (email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      user = await getUserByEmail(email);
    } else if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }
      user = await getUserByPhone(normalizedPhone);
    }

    // Always return success to prevent user enumeration
    if (!user) {
      return res.json({ 
        success: true, 
        message: 'If an account exists, a password reset link has been sent.' 
      });
    }

    // Generate reset token (JWT with 1 hour expiry)
    const jwt = require('jsonwebtoken');
    const resetToken = jwt.sign(
      { userId: user.id, type: 'reset' },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '1h' }
    );

    // Store token in database with expiry
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);
    await setResetToken(user.id, resetToken, expiry);

    // In production, send email/OTP here
    // For now, return token in response (remove in production)
    res.json({
      success: true,
      message: 'Password reset link has been sent.',
      // Remove this in production - only for development
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
    });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ error: 'Error processing password reset request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Validate password strength
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    // Find user by reset token
    const user = await getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Verify token is valid JWT
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      if (decoded.type !== 'reset' || decoded.userId !== user.id) {
        return res.status(400).json({ error: 'Invalid reset token' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await updateUserPassword(user.id, passwordHash);

    // Clear reset token
    await clearResetToken(user.id);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
});

module.exports = router;

