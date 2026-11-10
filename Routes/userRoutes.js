import express from 'express';
import { protect, authorize } from '../Middlewares/auth.js';
import {
  getAllUsers,
  getUserById,
  updateUserStatus,
  deleteUser,
} from '../Controllers/userController.js';

const router = express.Router();

// The Customer Directory CRM routes: Admin only
router.route('/').get(protect, authorize('admin'), getAllUsers);

router.patch('/:id/status', protect, authorize('admin'), updateUserStatus);

router
  .route('/:id')
  .get(protect, authorize('admin'), getUserById)
  .delete(protect, authorize('admin'), deleteUser);

export default router;

