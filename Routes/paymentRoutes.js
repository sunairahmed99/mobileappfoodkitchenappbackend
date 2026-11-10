import express from 'express';
import {
  createPaymentIntent,
  getStripeConfig,
  verifyPayment,
} from '../Controllers/paymentController.js';
import { protect } from '../Middlewares/auth.js';
import { paymentLimiter } from '../Middlewares/security.js';

const router = express.Router();

router.get('/config', getStripeConfig);
router.post('/create-payment-intent', protect, paymentLimiter, createPaymentIntent);
router.post('/verify', protect, verifyPayment);

export default router;
