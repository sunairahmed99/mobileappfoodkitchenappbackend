import express from 'express';
import { protect, authorize } from '../Middlewares/auth.js';
import { getSettings, updateSettings } from '../Controllers/settingsController.js';

const router = express.Router();

router.route('/')
  .get(getSettings)
  .put(protect, authorize('admin'), updateSettings);

export default router;
