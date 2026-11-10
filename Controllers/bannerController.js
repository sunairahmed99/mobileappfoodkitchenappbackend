import Banner from '../Models/Banner.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { handleControllerError } from '../Utils/errorResponse.js';

/**
 * @desc    Create a new Banner (with Cloudinary image upload)
 * @route   POST /api/banners
 * @access  Public / Admin
 */
export const createBanner = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      tag,
      discount,
      buttonText,
      backgroundColor,
      accentColor,
      isActive,
      order,
    } = req.body;

    let imageUrl = req.body.imageUrl;
    let cloudinaryId = null;

    // Check if an image file is uploaded
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/banners', req.file.originalname, req.file.mimetype);
      imageUrl = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Banner image is required (upload an image file or provide imageUrl)',
      });
    }

    const banner = await Banner.create({
      title: title || '',
      subtitle: subtitle || '',
      tag: tag || 'HOT DEAL',
      discount: discount || '',
      buttonText: buttonText || 'Order Now',
      imageUrl,
      cloudinaryId,
      backgroundColor: backgroundColor || '#1E1B18',
      accentColor: accentColor || '#EE4D2D',
      isActive: isActive !== undefined ? isActive : true,
      order: order ? Number(order) : 0,
    });

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      banner,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while creating banner');
  }
};

/**
 * @desc    Get all Banners
 * @route   GET /api/banners
 * @access  Public
 */
export const getAllBanners = async (req, res) => {
  try {
    const { active } = req.query;
    const filter = {};

    if (active === 'true') {
      filter.isActive = true;
    }

    const banners = await Banner.find(filter).sort({ order: 1, createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      count: banners.length,
      banners,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching banners');
  }
};

/**
 * @desc    Get single Banner by ID
 * @route   GET /api/banners/:id
 * @access  Public
 */
export const getBannerById = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found',
      });
    }

    res.status(200).json({
      success: true,
      banner,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching banner');
  }
};

/**
 * @desc    Update a Banner (optionally replace Cloudinary image)
 * @route   PUT /api/banners/:id
 * @access  Admin
 */
export const updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found',
      });
    }

    const {
      title,
      subtitle,
      tag,
      discount,
      buttonText,
      backgroundColor,
      accentColor,
      isActive,
      order,
      imageUrl,
    } = req.body;

    // If new image file is uploaded, upload to Cloudinary and remove previous image
    if (req.file) {
      if (banner.cloudinaryId) {
        await deleteFromCloudinary(banner.cloudinaryId);
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/banners', req.file.originalname, req.file.mimetype);
      banner.imageUrl = uploadResult.secure_url;
      banner.cloudinaryId = uploadResult.public_id;
    } else if (imageUrl) {
      banner.imageUrl = imageUrl;
    }

    if (title !== undefined) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (tag !== undefined) banner.tag = tag;
    if (discount !== undefined) banner.discount = discount;
    if (buttonText !== undefined) banner.buttonText = buttonText;
    if (backgroundColor !== undefined) banner.backgroundColor = backgroundColor;
    if (accentColor !== undefined) banner.accentColor = accentColor;
    if (isActive !== undefined) banner.isActive = isActive;
    if (order !== undefined) banner.order = Number(order);

    const updatedBanner = await banner.save();

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      banner: updatedBanner,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating banner');
  }
};

/**
 * @desc    Toggle Banner Active Status
 * @route   PATCH /api/banners/:id/status
 * @access  Admin
 */
export const toggleBannerStatus = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found',
      });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.status(200).json({
      success: true,
      message: `Banner is now ${banner.isActive ? 'active' : 'inactive'}`,
      banner,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while toggling banner status');
  }
};

/**
 * @desc    Delete a Banner (and delete Cloudinary image)
 * @route   DELETE /api/banners/:id
 * @access  Admin
 */
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found',
      });
    }

    // Delete image from Cloudinary if stored there
    if (banner.cloudinaryId) {
      await deleteFromCloudinary(banner.cloudinaryId);
    }

    await Banner.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while deleting banner');
  }
};
