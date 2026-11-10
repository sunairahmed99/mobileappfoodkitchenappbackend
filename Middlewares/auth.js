import jwt from 'jsonwebtoken';
import User from '../Models/User.js';
import { getJwtSecret } from '../Config/jwt.js';

/**
 * Protect routes - verifies JWT from Authorization header
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, getJwtSecret());

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User belonging to this token no longer exists.',
        });
      }

      if (req.user.status === 'Blocked') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended or blocked. Please contact customer support.',
        });
      }

      next();
    } catch (error) {
      console.error('Auth verification error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token invalid or expired.',
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no authorization token provided.',
    });
  }
};

/**
 * Grant access to specific roles (e.g. 'admin')
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user ? req.user.role : 'guest'}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

/**
 * Attach `req.user` when a valid token is present, but never block the request.
 *
 * Used by public endpoints that behave nicer when the caller happens to be
 * signed in (e.g. linking an Expo push token to the user) while still allowing
 * anonymous app installs — which is required to notify devices that have never
 * logged in.
 */
export const optionalProtect = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer')) {
    return next();
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], getJwtSecret());
    const user = await User.findById(decoded.id).select('-password');
    if (user) req.user = user;
  } catch {
    // Ignore an invalid token here — the route is public anyway.
  }

  return next();
};
