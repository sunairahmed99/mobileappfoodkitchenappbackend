import Category from '../Models/Category.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { handleControllerError } from '../Utils/errorResponse.js';

/**
 * @desc    Create a new Category (with Cloudinary image upload)
 * @route   POST /api/categories
 * @access  Admin
 */
export const createCategory = async (req, res) => {
  try {
    const { name, itemCount, isActive, order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    // Check if category name already exists (case-insensitive)
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'A category with this name already exists',
      });
    }

    let imageUrl = req.body.imageUrl;
    let cloudinaryId = null;

    // Check if image file is uploaded
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/categories', req.file.originalname || 'image.jpg', req.file.mimetype);
      imageUrl = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Category image is required (upload an image file or provide imageUrl)',
      });
    }

    const category = await Category.create({
      name: name.trim(),
      imageUrl,
      cloudinaryId,
      itemCount: itemCount ? Number(itemCount) : 0,
      isActive: isActive !== undefined ? isActive : true,
      order: order ? Number(order) : 0,
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while creating category');
  }
};

/**
 * @desc    Get all Categories
 * @route   GET /api/categories
 * @access  Public
 */
export const getAllCategories = async (req, res) => {
  try {
    const { active } = req.query;
    const filter = {};

    if (active === 'true') {
      filter.isActive = true;
    }

    const categories = await Category.find(filter).sort({ order: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching categories');
  }
};

/**
 * @desc    Get single Category by ID
 * @route   GET /api/categories/:id
 * @access  Public
 */
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching category');
  }
};

/**
 * @desc    Update a Category (optionally replace Cloudinary image)
 * @route   PUT /api/categories/:id
 * @access  Admin
 */
export const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const { name, itemCount, isActive, order, imageUrl } = req.body;

    // Check duplicate name if name changed
    if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
      const existing = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Another category with this name already exists',
        });
      }
      category.name = name.trim();
    }

    // If new image file is uploaded
    if (req.file) {
      if (category.cloudinaryId) {
        await deleteFromCloudinary(category.cloudinaryId);
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/categories', req.file.originalname || 'image.jpg', req.file.mimetype);
      category.imageUrl = uploadResult.secure_url;
      category.cloudinaryId = uploadResult.public_id;
    } else if (imageUrl) {
      category.imageUrl = imageUrl;
    }

    if (itemCount !== undefined) category.itemCount = Number(itemCount);
    if (isActive !== undefined) category.isActive = isActive;
    if (order !== undefined) category.order = Number(order);

    const updatedCategory = await category.save();

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      category: updatedCategory,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating category');
  }
};

/**
 * @desc    Toggle Category Active Status
 * @route   PATCH /api/categories/:id/status
 * @access  Admin
 */
export const toggleCategoryStatus = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    res.status(200).json({
      success: true,
      message: `Category is now ${category.isActive ? 'active' : 'inactive'}`,
      category,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while toggling category status');
  }
};

/**
 * @desc    Delete a Category (and delete Cloudinary image)
 * @route   DELETE /api/categories/:id
 * @access  Admin
 */
export const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    // Delete image from Cloudinary if stored there
    if (category.cloudinaryId) {
      await deleteFromCloudinary(category.cloudinaryId);
    }

    await Category.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while deleting category');
  }
};
