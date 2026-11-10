import express from 'express';
import {
  cancelMyOrder,
  createOrder,
  getAllOrders,
  getMyOrders,
  sendOrderConfirmationEmail,
  updateOrderStatus,
} from '../Controllers/orderController.js';
import { authorize, protect } from '../Middlewares/auth.js';

const router = express.Router();

router.post('/', protect, createOrder);
router.get('/mine', protect, getMyOrders);
router.get('/', protect, authorize('admin'), getAllOrders);
router.patch('/:orderId/status', protect, authorize('admin'), updateOrderStatus);
router.patch('/:orderId/cancel', protect, cancelMyOrder);
router.post('/confirmation-email', protect, sendOrderConfirmationEmail);

export default router;
