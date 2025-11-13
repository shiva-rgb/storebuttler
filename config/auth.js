const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT secret key from environment or use a default (should be changed in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'; // 7 days

/**
 * Generate JWT token for a user
 * @param {number} userId - User ID
 * @returns {string} JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {object|null} Decoded token payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Normalize phone number to +91XXXXXXXXXX format
 * @param {string} phone - Phone number in various formats
 * @returns {string|null} Normalized phone number or null if invalid
 */
function normalizePhone(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle different formats:
  // +91XXXXXXXXXX -> +91XXXXXXXXXX
  // 91XXXXXXXXXX -> +91XXXXXXXXXX
  // 0XXXXXXXXXX -> +91XXXXXXXXXX (remove leading 0)
  // XXXXXXXXXX -> +91XXXXXXXXXX (10 digits)
  
  let normalized;
  
  if (digits.length === 13 && digits.startsWith('91')) {
    // 91XXXXXXXXXX format
    normalized = '+' + digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    // Already has country code
    normalized = '+' + digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // 0XXXXXXXXXX format - remove leading 0 and add +91
    normalized = '+91' + digits.substring(1);
  } else if (digits.length === 10) {
    // XXXXXXXXXX format - add +91
    normalized = '+91' + digits;
  } else {
    return null; // Invalid format
  }
  
  // Validate: should be +91 followed by exactly 10 digits
  if (!/^\+91\d{10}$/.test(normalized)) {
    return null;
  }
  
  return normalized;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} { valid: boolean, message: string }
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter' };
  }
  
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  return { valid: true, message: 'Password is valid' };
}

module.exports = {
  generateToken,
  verifyToken,
  normalizePhone,
  validateEmail,
  validatePassword,
  JWT_SECRET
};

