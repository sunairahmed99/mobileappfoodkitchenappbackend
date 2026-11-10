import express from 'express';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  createVoucher,
  getAllVouchers,
  getVoucherById,
  updateVoucher,
  toggleVoucherStatus,
  deleteVoucher,
} from '../Controllers/voucherController.js';

const router = express.Router();

router.route('/')
  .get(getAllVouchers)
  .post(protect, authorize('admin'), createVoucher);

router.route('/:id')
  .get(getVoucherById)
  .put(protect, authorize('admin'), updateVoucher)
  .delete(protect, authorize('admin'), deleteVoucher);

router.patch('/:id/status', protect, authorize('admin'), toggleVoucherStatus);

export default router;
