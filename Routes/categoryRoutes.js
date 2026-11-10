import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} from '../Controllers/categoryController.js';

const router = express.Router();

router.route('/')
  .get(getAllCategories)
  .post(protect, authorize('admin'), upload.single('image'), createCategory);

router.route('/:id')
  .get(getCategoryById)
  .put(protect, authorize('admin'), upload.single('image'), updateCategory)
  .delete(protect, authorize('admin'), deleteCategory);

router.patch('/:id/status', protect, authorize('admin'), toggleCategoryStatus);

export default router;
