import Deal from '../Models/Deal.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { handleControllerError } from '../Utils/errorResponse.js';

// Helper to parse itemsIncluded from string / array
const parseItemsIncluded = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
};

/**
 * @desc    Create a new Deal (with optional Cloudinary image upload)
 * @route   POST /api/deals
 * @access  Admin / Public
 */
export const createDeal = async (req, res) => {
  try {
    const {
      dealTitle,
      tagline,
      description,
      itemsIncluded,
      originalPrice,
      dealPrice,
      discountPercentage,
      savedAmount,
      rating,
      reviewsCount,
      prepTime,
      serves,
      badge,
      isBestseller,
      isWeeklyDeal,
      day,
      shortDay,
      type,
      isActive,
      order,
    } = req.body;

    if (!dealTitle || !dealTitle.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Deal title is required',
      });
    }

    if (dealPrice === undefined || dealPrice === null || isNaN(Number(dealPrice))) {
      return res.status(400).json({
        success: false,
        message: 'Valid deal price is required',
      });
    }

    if (Number(dealPrice) < 0 || (originalPrice !== undefined && originalPrice !== null && Number(originalPrice) < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Deal prices cannot be negative',
      });
    }

    let imageUrl = req.body.imageUrl;
    let cloudinaryId = null;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/deals', req.file.originalname || 'image.jpg', req.file.mimetype);
      imageUrl = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Deal image is required (upload image file or provide imageUrl)',
      });
    }

    const origPrice = originalPrice ? Number(originalPrice) : Number(dealPrice);
    const dPrice = Number(dealPrice);
    const calculatedSaved = origPrice > dPrice ? origPrice - dPrice : 0;
    const calculatedPct =
      origPrice > dPrice
        ? `${Math.round(((origPrice - dPrice) / origPrice) * 100)}% OFF`
        : '';

    const deal = await Deal.create({
      dealTitle: dealTitle.trim(),
      tagline: tagline ? tagline.trim() : '',
      description: description || '',
      itemsIncluded: parseItemsIncluded(itemsIncluded),
      originalPrice: origPrice,
      dealPrice: dPrice,
      discountPercentage: discountPercentage || calculatedPct,
      savedAmount: savedAmount !== undefined ? Number(savedAmount) : calculatedSaved,
      rating: rating ? Number(rating) : 4.8,
      reviewsCount: reviewsCount ? Number(reviewsCount) : 100,
      prepTime: prepTime || '20-25 mins',
      serves: serves || '2 Persons',
      imageUrl,
      cloudinaryId,
      badge: badge || '',
      isBestseller: isBestseller === true || isBestseller === 'true',
      isWeeklyDeal: isWeeklyDeal === undefined ? true : (isWeeklyDeal === true || isWeeklyDeal === 'true'),
      day: day || '',
      shortDay: shortDay || '',
      type: type || 'combo',
      isActive: isActive === undefined ? true : (isActive === true || isActive === 'true'),
      order: order ? Number(order) : 0,
    });

    res.status(201).json({
      success: true,
      message: 'Deal created successfully',
      deal,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while creating deal');
  }
};

/**
 * @desc    Get all Deals with optional filtering
 * @route   GET /api/deals
 * @access  Public
 */
export const getAllDeals = async (req, res) => {
  try {
    const { active, type, weekly, search } = req.query;
    const filter = {};

    if (active === 'true') {
      filter.isActive = true;
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (weekly === 'true') {
      filter.isWeeklyDeal = true;
    }

    if (search && search.trim()) {
      filter.$or = [
        { dealTitle: { $regex: search.trim(), $options: 'i' } },
        { tagline: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const deals = await Deal.find(filter).sort({ order: 1, createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      count: deals.length,
      deals,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching deals');
  }
};

/**
 * @desc    Get single deal by ID
 * @route   GET /api/deals/:id
 * @access  Public
 */
export const getDealById = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: 'Deal not found',
      });
    }

    res.status(200).json({
      success: true,
      deal,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching deal');
  }
};

/**
 * @desc    Update a deal by ID
 * @route   PUT /api/deals/:id
 * @access  Admin
 */
export const updateDeal = async (req, res) => {
  try {
    let deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: 'Deal not found',
      });
    }

    const updateData = { ...req.body };

    if (updateData.itemsIncluded !== undefined) {
      updateData.itemsIncluded = parseItemsIncluded(updateData.itemsIncluded);
    }

    if (updateData.dealPrice !== undefined) {
      updateData.dealPrice = Number(updateData.dealPrice);
    }

    if (updateData.originalPrice !== undefined) {
      updateData.originalPrice = Number(updateData.originalPrice);
    }

    if (updateData.isBestseller !== undefined) {
      updateData.isBestseller = updateData.isBestseller === true || updateData.isBestseller === 'true';
    }

    if (updateData.isWeeklyDeal !== undefined) {
      updateData.isWeeklyDeal = updateData.isWeeklyDeal === true || updateData.isWeeklyDeal === 'true';
    }

    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive === true || updateData.isActive === 'true';
    }

    // Auto-recalculate savings and discount percentage if prices updated
    const origPrice = updateData.originalPrice !== undefined ? updateData.originalPrice : deal.originalPrice;
    const dPrice = updateData.dealPrice !== undefined ? updateData.dealPrice : deal.dealPrice;
    if (origPrice && dPrice) {
      updateData.savedAmount = origPrice > dPrice ? origPrice - dPrice : 0;
      if (!updateData.discountPercentage) {
        updateData.discountPercentage =
          origPrice > dPrice ? `${Math.round(((origPrice - dPrice) / origPrice) * 100)}% OFF` : '';
      }
    }

    // Handle new image upload
    if (req.file) {
      if (deal.cloudinaryId) {
        await deleteFromCloudinary(deal.cloudinaryId);
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/deals', req.file.originalname || 'image.jpg', req.file.mimetype);
      updateData.imageUrl = uploadResult.secure_url;
      updateData.cloudinaryId = uploadResult.public_id;
    }

    deal = await Deal.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Deal updated successfully',
      deal,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating deal');
  }
};

/**
 * @desc    Delete a deal by ID
 * @route   DELETE /api/deals/:id
 * @access  Admin
 */
export const deleteDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: 'Deal not found',
      });
    }

    if (deal.cloudinaryId) {
      await deleteFromCloudinary(deal.cloudinaryId);
    }

    await Deal.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Deal deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while deleting deal');
  }
};

/**
 * @desc    Toggle deal active / inactive status
 * @route   PATCH /api/deals/:id/status
 * @access  Admin
 */
export const toggleDealStatus = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({
        success: false,
        message: 'Deal not found',
      });
    }

    deal.isActive = !deal.isActive;
    await deal.save();

    res.status(200).json({
      success: true,
      message: `Deal is now ${deal.isActive ? 'Active' : 'Inactive'}`,
      deal,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while toggling status');
  }
};
