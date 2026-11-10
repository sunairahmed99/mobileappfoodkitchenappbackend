import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect } from '../Middlewares/auth.js';
import { authLimiter } from '../Middlewares/security.js';
import {
  register,
  login,
  googleLogin,
  verifyLoginOtp,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
} from '../Controllers/authController.js';

const router = express.Router();

// Public Authentication Routes (Guarded with auth rate limiter against brute-force attacks)
router.post('/register', authLimiter, upload.single('image'), register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.post('/verify-login-otp', authLimiter, verifyLoginOtp);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/verify-reset-otp', authLimiter, verifyResetOtp);
router.post('/reset-password', authLimiter, resetPassword);

// Protected User Routes (Require JWT Bearer Token)
router.get('/me', protect, getMe);
router.put('/profile', protect, upload.single('image'), updateProfile);
router.put('/change-password', protect, changePassword);

export default router;
