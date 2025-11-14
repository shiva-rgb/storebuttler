const { verifyToken } = require('../config/auth');

/**
 * Customer authentication middleware to verify JWT token from httpOnly cookie
 * Attaches customer_id to req.customer if token is valid
 * Uses 'customerToken' cookie name to differentiate from admin tokens
 */
function authenticateCustomer(req, res, next) {
  // Get token from httpOnly cookie (using customerToken to differentiate from admin)
  const token = req.cookies?.customerToken;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  
  // Verify token
  const decoded = verifyToken(token);
  
  if (!decoded || !decoded.customerId) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
  
  // Attach customer info to request
  req.customer = {
    id: decoded.customerId
  };
  
  next();
}

module.exports = {
  authenticateCustomer
};

