import Settings from '../Models/Settings.js';
import { handleControllerError } from '../Utils/errorResponse.js';
import { getIO } from '../socket.js';

/**
 * @desc    Get store settings (creates default if not found)
 * @route   GET /api/settings
 * @access  Public
 */
export const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        storeName: 'FOOD KITCHEN',
        logoUrl: '',
        tagline: 'Special Homemade Taste',
        isOpen: true,
        deliveryFee: 99,
        minOrderAmount: 400,
        announcement: 'Special Homemade Taste delivered fresh & hot to your doorstep! 🍲✨',
        estimatedDeliveryTime: '30-45 mins',
        jazzcashNumber: '',
        jazzcashAccountTitle: '',
        easypaisaNumber: '',
        easypaisaAccountTitle: '',
        whatsappNumber: '',
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch settings');
  }
};

/**
 * @desc    Update store settings (creates if not existing)
 * @route   PUT /api/settings
 * @access  Admin
 */
export const updateSettings = async (req, res) => {
  try {
    const updateData = {};
    const {
      storeName,
      logoUrl,
      tagline,
      isOpen,
      deliveryFee,
      minOrderAmount,
      announcement,
      estimatedDeliveryTime,
      jazzcashNumber,
      jazzcashAccountTitle,
      easypaisaNumber,
      easypaisaAccountTitle,
      whatsappNumber,
    } = req.body;

    if (storeName !== undefined) updateData.storeName = String(storeName).trim();
    if (logoUrl !== undefined) updateData.logoUrl = String(logoUrl).trim();
    if (tagline !== undefined) updateData.tagline = String(tagline).trim();
    if (isOpen !== undefined) updateData.isOpen = Boolean(isOpen);
    if (deliveryFee !== undefined) updateData.deliveryFee = Number(deliveryFee);
    if (minOrderAmount !== undefined) updateData.minOrderAmount = Number(minOrderAmount);
    if (announcement !== undefined) updateData.announcement = String(announcement).trim();
    if (estimatedDeliveryTime !== undefined) updateData.estimatedDeliveryTime = String(estimatedDeliveryTime).trim();
    if (jazzcashNumber !== undefined) updateData.jazzcashNumber = String(jazzcashNumber).trim();
    if (jazzcashAccountTitle !== undefined) updateData.jazzcashAccountTitle = String(jazzcashAccountTitle).trim();
    if (easypaisaNumber !== undefined) updateData.easypaisaNumber = String(easypaisaNumber).trim();
    if (easypaisaAccountTitle !== undefined) updateData.easypaisaAccountTitle = String(easypaisaAccountTitle).trim();
    if (whatsappNumber !== undefined) updateData.whatsappNumber = String(whatsappNumber).trim();

    if (updateData.deliveryFee !== undefined && (!Number.isFinite(updateData.deliveryFee) || updateData.deliveryFee < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Delivery fee must be a non-negative number',
      });
    }
    if (updateData.minOrderAmount !== undefined && (!Number.isFinite(updateData.minOrderAmount) || updateData.minOrderAmount < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Minimum order amount must be a non-negative number',
      });
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    // Broadcast updated settings to all connected users in real time
    try {
      const io = getIO();
      if (io) {
        io.emit('settings_updated', settings);
      }
    } catch {
      // socket might be uninitialized in some test contexts
    }

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to update settings');
  }
};
