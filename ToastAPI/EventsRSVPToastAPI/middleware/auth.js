const { admin } = require('../models/firebase');

// Authentication middleware function
const auth = async (req, res, next) => {
  try {
    // Get the token from the Authorization header and remove the 'Bearer ' prefix
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    // Verify the token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('❌ Auth Middleware Error:', error);
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = auth;