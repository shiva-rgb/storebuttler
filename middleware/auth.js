const { verifyToken } = require('../config/auth');

/**
 * Authentication middleware to verify JWT token from httpOnly cookie
 * Attaches user_id to req.user if token is valid
 */
function authenticateToken(req, res, next) {
  // Get token from httpOnly cookie
  const token = req.cookies?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  
  // Verify token
  const decoded = verifyToken(token);
  
  if (!decoded || !decoded.userId) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
  
  // Attach user info to request
  req.user = {
    id: decoded.userId
  };
  
  next();
}

module.exports = {
  authenticateToken
};

