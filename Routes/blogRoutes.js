import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  toggleBlogStatus,
  likeBlog,
} from '../Controllers/blogController.js';

const router = express.Router();

router.route('/')
  .get(getAllBlogs)
  .post(protect, authorize('admin'), upload.single('image'), createBlog);

router.route('/:id')
  .get(getBlogById)
  .put(protect, authorize('admin'), upload.single('image'), updateBlog)
  .delete(protect, authorize('admin'), deleteBlog);

router.patch('/:id/status', protect, authorize('admin'), toggleBlogStatus);
router.patch('/:id/like', likeBlog);

export default router;
