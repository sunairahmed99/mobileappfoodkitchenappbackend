import express from 'express';
import upload from '../Middlewares/multer.js';
import { protect, authorize } from '../Middlewares/auth.js';
import { uploadToCloudinary } from '../Config/cloudinary.js';

const router = express.Router();

/**
 * @route   POST /api/upload
 * @desc    Upload an image file to Cloudinary (or local storage fallback)
 * @access  Private / Admin
 */
router.post('/', protect, authorize('admin'), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded. Please send a file with field name "image".',
      });
    }

    const folder = req.body.folder || 'homefoods/uploads';
    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      folder,
      req.file.originalname || 'upload.jpg',
      req.file.mimetype
    );

    return res.status(200).json({
      success: true,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      message: 'Image uploaded successfully!',
    });
  } catch (error) {
    console.error('Image upload failed:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Image upload failed',
    });
  }
});

export default router;
