import rateLimit from 'express-rate-limit';

/**
 * Rate Limiter for Authentication & Sensitive Endpoints
 * Prevents brute-force attacks on login, register, OTP verification, and reset password.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 auth requests per 15-minute window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

/**
 * Rate Limiter for Payment Operations
 * Protects Stripe Payment Intent creation from card testing and spam.
 */
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 40, // Limit each IP to 40 payment intents per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many payment requests. Please try again shortly.',
  },
});

/**
 * General API Rate Limiter
 * Guards against aggressive scraping and denial of service.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 800, // Generous limit for mobile app active polling & navigation
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many requests. Please slow down and try again later.',
  },
});

/**
 * Lightweight NoSQL Injection Protection
 * Recursively sanitizes keys starting with '$' or containing '.' in req.body, req.query, and req.params
 */
export const sanitizeData = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
  };

  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);

  next();
};
