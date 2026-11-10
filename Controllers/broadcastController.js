import BroadcastNotification from '../Models/BroadcastNotification.js';
import Device from '../Models/Device.js';
import { sendBroadcastPush } from '../Utils/pushNotifications.js';
import { handleControllerError } from '../Utils/errorResponse.js';
import { getIO } from '../socket.js';

const ALLOWED_TYPES = ['order', 'offer', 'system'];
const ALLOWED_PLATFORMS = ['ios', 'android', 'web'];

/**
 * Shapes a Mongo document into the payload the mobile app consumes.
 * `id` is a string (not `_id`) so the client mapping stays trivial.
 */
const serializeBroadcast = (doc) => ({
  id: String(doc._id),
  type: doc.type,
  title: doc.title,
  message: doc.message,
  icon: doc.icon || '',
  iconBg: doc.iconBg || '',
  iconColor: doc.iconColor || '',
  targetType: doc.targetType || 'all',
  targetUserId: doc.targetUserId ? String(doc.targetUserId) : null,
  targetUserName: doc.targetUserName || '',
  targetTier: doc.targetTier || 'all',
  discountCode: doc.discountCode || '',
  sentByName: doc.sentByName || 'Admin',
  deliveredCount: doc.deliveredCount || 0,
  failedCount: doc.failedCount || 0,
  pushSent: Boolean(doc.pushSent),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/**
 * @desc    List all broadcast announcements (newest first)
 * @route   GET /api/broadcasts
 * @access  Public (filtered if logged in user is regular customer)
 */
export const getBroadcasts = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    let filter = {};

    // If caller is an admin, return all announcements
    if (req.user?.role === 'admin') {
      filter = {};
    } else if (req.user?._id) {
      // Calculate user loyalty tier
      const userSpent = Number(req.user.totalSpent) || 0;
      const userOrders = Number(req.user.totalOrders) || 0;
      let userTier = 'Regular';
      if (req.user.membershipTier === 'Platinum' || userSpent >= 5000 || userOrders >= 5) {
        userTier = 'VIP';
      } else if (req.user.membershipTier === 'Gold' || userSpent >= 2500 || userOrders >= 2) {
        userTier = 'Gold';
      }

      filter = {
        $or: [
          { targetType: 'all' },
          { targetType: { $exists: false } },
          { targetUserId: req.user._id },
          { targetType: 'tier', targetTier: { $in: [userTier, 'all'] } },
        ],
      };
    } else {
      filter = {
        $or: [{ targetType: 'all' }, { targetType: { $exists: false } }],
      };
    }

    const broadcasts = await BroadcastNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      count: broadcasts.length,
      broadcasts: broadcasts.map(serializeBroadcast),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch broadcast announcements');
  }
};

/**
 * @desc    Create a broadcast and push it to targeted or all installed devices
 * @route   POST /api/broadcasts
 * @access  Admin
 */
export const createBroadcast = async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      icon,
      iconBg,
      iconColor,
      targetType = 'all',
      targetUserId = null,
      targetUserName = '',
      targetTier = 'all',
      discountCode = '',
    } = req.body || {};

    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';

    if (!cleanTitle) {
      return res.status(400).json({ success: false, message: 'Announcement title is required' });
    }
    if (!cleanMessage) {
      return res.status(400).json({ success: false, message: 'Broadcast message is required' });
    }

    const normalizedType = ALLOWED_TYPES.includes(type) ? type : 'system';
    const normalizedTargetType = ['all', 'specific_user', 'tier'].includes(targetType)
      ? targetType
      : 'all';

    const broadcast = await BroadcastNotification.create({
      title: cleanTitle,
      message: cleanMessage,
      type: normalizedType,
      icon: typeof icon === 'string' ? icon.trim() : '',
      iconBg: typeof iconBg === 'string' ? iconBg.trim() : '',
      iconColor: typeof iconColor === 'string' ? iconColor.trim() : '',
      targetType: normalizedTargetType,
      targetUserId: normalizedTargetType === 'specific_user' && targetUserId ? targetUserId : null,
      targetUserName:
        normalizedTargetType === 'specific_user' && targetUserName
          ? String(targetUserName).trim()
          : '',
      targetTier:
        normalizedTargetType === 'tier' && ['VIP', 'Gold', 'Regular'].includes(targetTier)
          ? targetTier
          : 'all',
      discountCode: typeof discountCode === 'string' ? discountCode.trim().toUpperCase() : '',
      sentBy: req.user?._id || null,
      sentByName: req.user?.name || 'Admin',
    });

    const payload = serializeBroadcast(broadcast);

    // Real-time in-app delivery for every connected client (open apps).
    try {
      getIO().emit('broadcast_notification', payload);
    } catch (socketError) {
      console.warn('[Broadcast] Socket broadcast skipped:', socketError?.message || socketError);
    }

    // Remote push delivery for installed apps (even when closed / logged out).
    let push = { total: 0, targeted: 0, sent: 0, failed: 0 };
    try {
      push = await sendBroadcastPush({
        title: cleanTitle,
        message: cleanMessage,
        type: normalizedType,
        targetType: broadcast.targetType,
        targetUserId: broadcast.targetUserId,
        targetTier: broadcast.targetTier,
        data: {
          broadcastId: String(broadcast._id),
          type: normalizedType,
          discountCode: broadcast.discountCode || '',
        },
      });
    } catch (pushError) {
      console.error('[Broadcast] Push delivery failed:', pushError?.message || pushError);
    }

    broadcast.deliveredCount = push.sent || 0;
    broadcast.failedCount = push.failed || 0;
    broadcast.pushSent = (push.sent || 0) > 0;
    await broadcast.save();

    res.status(201).json({
      success: true,
      message: `Announcement sent successfully (${push.sent || 0} push delivered)`,
      broadcast: serializeBroadcast(broadcast),
      push,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to send broadcast announcement');
  }
};

/**
 * @desc    Delete a broadcast announcement
 * @route   DELETE /api/broadcasts/:id
 * @access  Admin
 */
export const deleteBroadcast = async (req, res) => {
  try {
    const broadcast = await BroadcastNotification.findByIdAndDelete(req.params.id);

    if (!broadcast) {
      return res.status(404).json({ success: false, message: 'Broadcast announcement not found' });
    }

    try {
      getIO().emit('broadcast_deleted', { id: String(broadcast._id) });
    } catch {
      // Socket.IO not initialised (e.g. unit tests) — realtime signal is optional.
    }

    res.status(200).json({
      success: true,
      message: 'Broadcast announcement deleted successfully',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to delete broadcast announcement');
  }
};

/**
 * @desc    Register (or refresh) this app install's Expo push token
 * @route   POST /api/broadcasts/register-device
 * @access  Public (optional auth links the token to a signed-in user)
 */
export const registerDevice = async (req, res) => {
  try {
    const { pushToken, platform, deviceName } = req.body || {};

    if (!pushToken || typeof pushToken !== 'string' || !pushToken.trim()) {
      return res.status(400).json({ success: false, message: 'pushToken is required' });
    }

    const token = pushToken.trim();
    const normalizedPlatform = ALLOWED_PLATFORMS.includes(platform) ? platform : 'unknown';

    const update = {
      platform: normalizedPlatform,
      deviceName: typeof deviceName === 'string' ? deviceName.trim() : '',
      isActive: true,
      lastSeenAt: new Date(),
    };
    if (req.user?._id) {
      update.userId = req.user._id;
    }

    const device = await Device.findOneAndUpdate(
      { pushToken: token },
      { $set: update, $setOnInsert: { pushToken: token } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Device registered for push notifications',
      device: {
        id: String(device._id),
        pushToken: device.pushToken,
        platform: device.platform,
      },
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to register device for push notifications');
  }
};

/**
 * @desc    Unregister this device (e.g. on logout / notifications disabled)
 * @route   POST /api/broadcasts/unregister-device
 * @access  Public
 */
export const unregisterDevice = async (req, res) => {
  try {
    const { pushToken } = req.body || {};

    if (!pushToken || typeof pushToken !== 'string' || !pushToken.trim()) {
      return res.status(400).json({ success: false, message: 'pushToken is required' });
    }

    await Device.updateOne(
      { pushToken: pushToken.trim() },
      { $set: { isActive: false } }
    );

    res.status(200).json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to unregister device');
  }
};

/**
 * @desc    How many devices are currently reachable
 * @route   GET /api/broadcasts/devices/count
 * @access  Admin
 */
export const getDeviceCount = async (req, res) => {
  try {
    const [total, active] = await Promise.all([
      Device.countDocuments(),
      Device.countDocuments({ isActive: true }),
    ]);

    res.status(200).json({ success: true, total, active });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to count registered devices');
  }
};
