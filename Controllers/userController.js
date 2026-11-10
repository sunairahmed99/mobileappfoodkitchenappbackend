import User from '../Models/User.js';
import Order from '../Models/Order.js';
import { handleControllerError } from '../Utils/errorResponse.js';

/**
 * Admin CRM over registered customers.
 *
 * Only `role: 'user'` accounts are ever listed or mutated here — admin accounts
 * are invisible to (and therefore safe from) this directory.
 */

/** Membership tiers are internal; the CRM shows friendlier tiers. */
const TIER_MAP = {
  Platinum: 'VIP',
  Gold: 'Gold',
  Silver: 'Regular',
  Bronze: 'Regular',
};

const formatJoinedDate = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

/** Shapes a user document into the `StoreCustomer` item the admin app renders. */
export const serializeCustomer = (user) => {
  const totalSpent = Number(user.totalSpent) || 0;
  const totalOrders = Number(user.totalOrders) || 0;

  // Dynamically assign tier based on loyalty/spending or saved tier
  let tier = TIER_MAP[user.membershipTier] || 'Regular';
  if (user.membershipTier === 'Platinum' || totalSpent >= 5000 || totalOrders >= 5) {
    tier = 'VIP';
  } else if (user.membershipTier === 'Gold' || totalSpent >= 2500 || totalOrders >= 2) {
    tier = 'Gold';
  }

  return {
    id: String(user._id),
    name: user.name || 'Customer',
    email: user.email || '',
    phone: user.phone || '',
    city: user.city || '',
    address: user.address || '',
    avatar: user.avatar || '',
    tier,
    membershipTier: user.membershipTier || 'Bronze',
    totalOrders,
    totalSpent,
    joinedDate: formatJoinedDate(user.createdAt),
    addressesCount: user.address ? 1 : totalOrders > 0 ? 1 : 0,
    status: user.status || 'Active',
  };
};

/**
 * @desc    List every registered customer
 * @route   GET /api/users
 * @access  Admin
 */
export const getAllUsers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = { role: 'user' };

    if (status === 'Active' || status === 'Blocked') {
      filter.status = status;
    }

    if (search && String(search).trim()) {
      const term = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(term, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { city: regex }];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).lean();

    // Aggregate real order statistics for each user so spend and orders are 100% dynamic
    const userIds = users.map((u) => u._id);
    const emails = users.map((u) => u.email).filter(Boolean);

    const orderStatsMap = new Map();
    try {
      const orderAggregates = await Order.aggregate([
        {
          $match: {
            $or: [
              { userId: { $in: userIds } },
              { customerEmail: { $in: emails } },
            ],
          },
        },
        {
          $group: {
            _id: '$userId',
            email: { $first: '$customerEmail' },
            orderCount: { $sum: 1 },
            spendSum: { $sum: '$total' },
            latestAddress: { $last: '$address' },
          },
        },
      ]);

      orderAggregates.forEach((agg) => {
        if (agg._id) orderStatsMap.set(String(agg._id), agg);
        if (agg.email) orderStatsMap.set(String(agg.email).toLowerCase(), agg);
      });
    } catch (aggErr) {
      console.warn('Order aggregation warning:', aggErr.message);
    }

    const enrichedUsers = users.map((user) => {
      const stats =
        orderStatsMap.get(String(user._id)) ||
        (user.email ? orderStatsMap.get(user.email.toLowerCase()) : null);
      const totalOrders = stats ? stats.orderCount : (user.totalOrders || 0);
      const totalSpent = stats ? stats.spendSum : (user.totalSpent || 0);
      const address = user.address || (stats ? stats.latestAddress : '') || '';
      return {
        ...user,
        totalOrders,
        totalSpent,
        address,
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedUsers.length,
      users: enrichedUsers.map(serializeCustomer),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch customers');
  }
};

/**
 * @desc    Get a single customer
 * @route   GET /api/users/:id
 * @access  Admin
 */
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.status(200).json({ success: true, user: serializeCustomer(user) });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch customer');
  }
};

/**
 * @desc    Block / unblock a customer
 * @route   PATCH /api/users/:id/status
 * @access  Admin
 */
export const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body || {};

    if (status !== 'Active' && status !== 'Blocked') {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'Active' or 'Blocked'",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts cannot be blocked from the customer directory',
      });
    }

    user.status = status;
    // `validateBeforeSave: false` keeps the untouched (hashed) password intact.
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: `Customer marked as ${status}`,
      user: serializeCustomer(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to update customer status');
  }
};

/**
 * @desc    Permanently delete a customer account
 * @route   DELETE /api/users/:id
 * @access  Admin
 */
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin accounts cannot be deleted from the customer directory',
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to delete customer');
  }
};
