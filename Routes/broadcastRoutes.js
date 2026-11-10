import express from 'express';
import { protect, authorize, optionalProtect } from '../Middlewares/auth.js';
import {
  getBroadcasts,
  createBroadcast,
  deleteBroadcast,
  registerDevice,
  unregisterDevice,
  getDeviceCount,
} from '../Controllers/broadcastController.js';

const router = express.Router();

// ── Device (push token) registration — public so app installs can subscribe ──
router.post('/register-device', optionalProtect, registerDevice);
router.post('/unregister-device', optionalProtect, unregisterDevice);

// ── Admin insight: how many installs we can reach ──
router.get('/devices/count', protect, authorize('admin'), getDeviceCount);

// ── Broadcast CRUD ──
router
  .route('/')
  .get(optionalProtect, getBroadcasts)
  .post(protect, authorize('admin'), createBroadcast);

router.delete('/:id', protect, authorize('admin'), deleteBroadcast);

export default router;
