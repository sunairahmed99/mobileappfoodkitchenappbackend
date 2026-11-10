import multer from 'multer';

// Use memory storage so file is held in RAM as a Buffer, ready for Cloudinary upload
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, etc.) are allowed!'), false);
  }
};

const multerUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum
  },
});

/**
 * Rejected uploads (wrong type / too large) are client errors, so they are
 * answered with 400 instead of being handed to the generic 500 error handler.
 */
const translateUploadError = (req, res, next) => (error) => {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Image is too large. The maximum allowed size is 10MB.',
    });
  }

  return res.status(400).json({
    success: false,
    message: error.message || 'Invalid file upload.',
  });
};

const upload = {
  single: (fieldName) => (req, res, next) =>
    multerUpload.single(fieldName)(req, res, translateUploadError(req, res, next)),
};

export default upload;
