import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  createBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  toggleBannerStatus,
  deleteBanner,
} from '../Controllers/bannerController.js';

const router = express.Router();

router.route('/')
  .get(getAllBanners)
  .post(protect, authorize('admin'), upload.single('image'), createBanner);

router.route('/:id')
  .get(getBannerById)
  .put(protect, authorize('admin'), upload.single('image'), updateBanner)
  .delete(protect, authorize('admin'), deleteBanner);

router.patch('/:id/status', protect, authorize('admin'), toggleBannerStatus);

export default router;
