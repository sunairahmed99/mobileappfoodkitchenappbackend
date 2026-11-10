import FoodItem from '../Models/FoodItem.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { handleControllerError } from '../Utils/errorResponse.js';
import { recomputeCatalogStats } from '../Utils/catalogStats.js';

/**
 * @desc  Get all food items (optionally filter by categoryId or active status)
 * @route GET /api/food-items?categoryId=xxx&active=true
 */
export const getAllFoodItems = async (req, res) => {
  try {
    const { categoryId, active, search } = req.query;
    const filter = {};

    if (categoryId) filter.categoryId = categoryId;
    if (active !== undefined) filter.isActive = active === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };

    const items = await FoodItem.find(filter)
      .populate('categoryId', 'name imageUrl')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while fetching food items');
  }
};

/**
 * @desc  Get single food item by ID
 * @route GET /api/food-items/:id
 */
export const getFoodItemById = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id).populate('categoryId', 'name imageUrl');
    if (!item) return res.status(404).json({ success: false, message: 'Food item not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while fetching food item');
  }
};

/**
 * @desc  Recompute the derived ranking fields (avgRating, reviewsCount, soldCount,
 *        isBestseller, isTopRated) from the stored orders and reviews
 * @route POST /api/food-items/recompute-stats?categoryId=xxx
 * @access Admin
 */
export const recomputeFoodItemStats = async (req, res) => {
  try {
    const categoryId = req.query.categoryId || req.body?.categoryId;
    const result = await recomputeCatalogStats(categoryId ? { categoryId } : {});

    res.json({
      success: true,
      message: 'Catalog stats recomputed from orders and reviews',
      ...result,
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while recomputing catalog stats');
  }
};

/**
 * @desc  Create a new food item (with optional Cloudinary image upload)
 * @route POST /api/food-items
 */
export const createFoodItem = async (req, res) => {
  try {
    const {
      name, categoryId, description, price, originalPrice,
      tag, tagColor, prepTime, rating, isPopular, isNew, isActive, order,
      servingOptions,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Food item name is required' });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }
    if (!price && price !== 0) {
      return res.status(400).json({ success: false, message: 'Price is required' });
    }
    if (Number(price) < 0 || (originalPrice !== undefined && originalPrice !== null && Number(originalPrice) < 0)) {
      return res.status(400).json({ success: false, message: 'Prices cannot be negative' });
    }

    let imageUrl = req.body.imageUrl || '';
    let cloudinaryId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'homefoods/food-items', req.file.originalname || 'image.jpg', req.file.mimetype);
      imageUrl = result.secure_url;
      cloudinaryId = result.public_id;
    }

    // Parse servingOptions if sent as JSON string
    let parsedServingOptions = [];
    if (servingOptions) {
      try {
        parsedServingOptions = typeof servingOptions === 'string'
          ? JSON.parse(servingOptions)
          : servingOptions;
      } catch (_) {}
    }

    const item = await FoodItem.create({
      name: name.trim(),
      categoryId,
      description: description?.trim() || '',
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : 0,
      tag: tag || 'Special',
      tagColor: tagColor || '#EE4D2D',
      imageUrl,
      cloudinaryId,
      prepTime: prepTime || '20 mins',
      rating: rating ? Number(rating) : 4.5,
      isPopular: isPopular === 'true' || isPopular === true,
      isNew: isNew === 'true' || isNew === true,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      order: order ? Number(order) : 0,
      servingOptions: parsedServingOptions,
    });

    const populated = await item.populate('categoryId', 'name imageUrl');

    res.status(201).json({
      success: true,
      message: 'Food item created successfully',
      data: populated,
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while creating food item');
  }
};

/**
 * @desc  Update a food item
 * @route PUT /api/food-items/:id
 */
export const updateFoodItem = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Food item not found' });

    const {
      name, categoryId, description, price, originalPrice,
      tag, tagColor, prepTime, rating, isPopular, isNew, isActive, order,
      servingOptions,
    } = req.body;

    let { imageUrl, cloudinaryId } = item;

    if (req.file) {
      // Delete old Cloudinary image
      if (item.cloudinaryId) {
        try { await deleteFromCloudinary(item.cloudinaryId); } catch (_) {}
      }
      const result = await uploadToCloudinary(req.file.buffer, 'homefoods/food-items', req.file.originalname || 'image.jpg', req.file.mimetype);
      imageUrl = result.secure_url;
      cloudinaryId = result.public_id;
    } else if (req.body.imageUrl) {
      imageUrl = req.body.imageUrl;
    }

    let parsedServingOptions = item.servingOptions;
    if (servingOptions) {
      try {
        parsedServingOptions = typeof servingOptions === 'string'
          ? JSON.parse(servingOptions)
          : servingOptions;
      } catch (_) {}
    }

    const updated = await FoodItem.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name: name.trim() }),
        ...(categoryId && { categoryId }),
        ...(description !== undefined && { description: description.trim() }),
        ...(price !== undefined && { price: Number(price) }),
        ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
        ...(tag && { tag }),
        ...(tagColor && { tagColor }),
        imageUrl,
        cloudinaryId,
        ...(prepTime && { prepTime }),
        ...(rating !== undefined && { rating: Number(rating) }),
        ...(isPopular !== undefined && { isPopular: isPopular === 'true' || isPopular === true }),
        ...(isNew !== undefined && { isNew: isNew === 'true' || isNew === true }),
        ...(isActive !== undefined && { isActive: isActive === 'true' || isActive === true }),
        ...(order !== undefined && { order: Number(order) }),
        servingOptions: parsedServingOptions,
      },
      { new: true }
    ).populate('categoryId', 'name imageUrl');

    res.json({ success: true, message: 'Food item updated', data: updated });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while updating food item');
  }
};

/**
 * @desc  Toggle active / inactive status
 * @route PATCH /api/food-items/:id/status
 */
export const toggleFoodItemStatus = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Food item not found' });

    item.isActive = !item.isActive;
    await item.save();

    res.json({ success: true, message: `Food item ${item.isActive ? 'activated' : 'deactivated'}`, data: item });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while toggling food item status');
  }
};

/**
 * @desc  Delete a food item (also removes Cloudinary image)
 * @route DELETE /api/food-items/:id
 */
export const deleteFoodItem = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Food item not found' });

    if (item.cloudinaryId) {
      try { await deleteFromCloudinary(item.cloudinaryId); } catch (_) {}
    }

    await item.deleteOne();
    res.json({ success: true, message: 'Food item deleted successfully' });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while deleting food item');
  }
};
