import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  createDeal,
  getAllDeals,
  getDealById,
  updateDeal,
  deleteDeal,
  toggleDealStatus,
} from '../Controllers/dealController.js';

const router = express.Router();

router.route('/')
  .get(getAllDeals)
  .post(protect, authorize('admin'), upload.single('image'), createDeal);

router.route('/:id')
  .get(getDealById)
  .put(protect, authorize('admin'), upload.single('image'), updateDeal)
  .delete(protect, authorize('admin'), deleteDeal);

router.patch('/:id/status', protect, authorize('admin'), toggleDealStatus);

export default router;
