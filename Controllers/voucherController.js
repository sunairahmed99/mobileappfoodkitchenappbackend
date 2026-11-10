import Voucher from '../Models/Voucher.js';
import { handleControllerError } from '../Utils/errorResponse.js';

/** Coerces a body value to a number, falling back when it is not a real number. */
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Body values arrive as strings from FormData, so only an explicit "false" disables a voucher. */
const toBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() !== 'false';
};

const normaliseCode = (code) => String(code || '').trim().toUpperCase();

/**
 * @desc    Create a new Voucher
 * @route   POST /api/vouchers
 * @access  Admin
 */
export const createVoucher = async (req, res) => {
  try {
    const { code, discountType, discountValue, minOrder, expiryDate, isActive } = req.body;

    const voucherCode = normaliseCode(code);
    if (!voucherCode) {
      return res.status(400).json({
        success: false,
        message: 'Voucher code is required',
      });
    }

    if (discountValue === undefined || discountValue === null || discountValue === '') {
      return res.status(400).json({
        success: false,
        message: 'Discount value is required',
      });
    }

    const existing = await Voucher.findOne({ code: voucherCode });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Voucher "${voucherCode}" already exists`,
      });
    }

    const voucher = await Voucher.create({
      code: voucherCode,
      discountType: discountType === 'percentage' ? 'percentage' : 'fixed',
      discountValue: toNumber(discountValue),
      minOrder: toNumber(minOrder),
      expiryDate: expiryDate || '',
      isActive: toBoolean(isActive),
    });

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully',
      voucher,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while creating voucher');
  }
};

/**
 * @desc    Get all Vouchers
 * @route   GET /api/vouchers
 * @access  Public
 */
export const getAllVouchers = async (req, res) => {
  try {
    const { active, search } = req.query;
    const filter = {};

    if (active === 'true') {
      filter.isActive = true;
    }

    if (search) {
      // The code is stored uppercase, so an anchored case-insensitive regex keeps it index friendly.
      filter.code = { $regex: `^${String(search).trim().toUpperCase()}`, $options: 'i' };
    }

    const vouchers = await Voucher.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: vouchers.length,
      vouchers,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching vouchers');
  }
};

/**
 * @desc    Get single Voucher by ID
 * @route   GET /api/vouchers/:id
 * @access  Public
 */
export const getVoucherById = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found',
      });
    }

    res.status(200).json({
      success: true,
      voucher,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching voucher');
  }
};

/**
 * @desc    Update a Voucher
 * @route   PUT /api/vouchers/:id
 * @access  Admin
 */
export const updateVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found',
      });
    }

    const { code, discountType, discountValue, minOrder, expiryDate, isActive } = req.body;

    if (code !== undefined) {
      const voucherCode = normaliseCode(code);
      if (!voucherCode) {
        return res.status(400).json({
          success: false,
          message: 'Voucher code is required',
        });
      }

      // A rename must not collide with another voucher's code.
      if (voucherCode !== voucher.code) {
        const clash = await Voucher.findOne({ code: voucherCode });
        if (clash) {
          return res.status(409).json({
            success: false,
            message: `Voucher "${voucherCode}" already exists`,
          });
        }
        voucher.code = voucherCode;
      }
    }

    if (discountValue !== undefined && discountValue !== null && discountValue !== '') {
      voucher.discountValue = toNumber(discountValue);
    }
    if (discountType !== undefined) {
      voucher.discountType = discountType === 'percentage' ? 'percentage' : 'fixed';
    }
    if (minOrder !== undefined) {
      voucher.minOrder = toNumber(minOrder);
    }
    if (expiryDate !== undefined) {
      voucher.expiryDate = expiryDate || '';
    }
    if (isActive !== undefined) {
      voucher.isActive = toBoolean(isActive);
    }

    const updatedVoucher = await voucher.save();

    res.status(200).json({
      success: true,
      message: 'Voucher updated successfully',
      voucher: updatedVoucher,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating voucher');
  }
};

/**
 * @desc    Toggle Voucher Active Status
 * @route   PATCH /api/vouchers/:id/status
 * @access  Admin
 */
export const toggleVoucherStatus = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found',
      });
    }

    voucher.isActive = !voucher.isActive;
    await voucher.save();

    res.status(200).json({
      success: true,
      message: `Voucher is now ${voucher.isActive ? 'active' : 'inactive'}`,
      voucher,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while toggling voucher status');
  }
};

/**
 * @desc    Delete a Voucher
 * @route   DELETE /api/vouchers/:id
 * @access  Admin
 */
export const deleteVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found',
      });
    }

    await Voucher.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Voucher deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while deleting voucher');
  }
};
