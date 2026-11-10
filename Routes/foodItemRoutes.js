import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  getAllFoodItems,
  getFoodItemById,
  createFoodItem,
  updateFoodItem,
  toggleFoodItemStatus,
  deleteFoodItem,
  recomputeFoodItemStats,
} from '../Controllers/foodItemController.js';

const router = express.Router();

router.route('/')
  .get(getAllFoodItems)
  .post(protect, authorize('admin'), upload.single('image'), createFoodItem);

// Declared before /:id so the literal path is not captured as an id.
router.post('/recompute-stats', protect, authorize('admin'), recomputeFoodItemStats);

router.route('/:id')
  .get(getFoodItemById)
  .put(protect, authorize('admin'), upload.single('image'), updateFoodItem)
  .delete(protect, authorize('admin'), deleteFoodItem);

router.patch('/:id/status', protect, authorize('admin'), toggleFoodItemStatus);

export default router;
