import express from 'express';
import { protect, authorize, optionalProtect } from '../Middlewares/auth.js';
import {
  deleteReview,
  getAllReviews,
  getFoodItemReviews,
  toggleReviewApproval,
  upsertReview,
} from '../Controllers/reviewController.js';

const router = express.Router();

router.route('/')
  .get(protect, authorize('admin'), getAllReviews)
  .post(protect, upsertReview);

router.get('/food-item/:foodItemId', getFoodItemReviews);

router.patch('/:id/approve', protect, authorize('admin'), toggleReviewApproval);

router.delete('/:id', protect, deleteReview);

export default router;
