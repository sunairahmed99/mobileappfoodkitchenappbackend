import Device from '../Models/Device.js';
import User from '../Models/User.js';

/**
 * Expo Push Service helpers.
 *
 * Uses the public Expo Push API directly (no extra SDK dependency) — the
 * project already ships `expo-notifications` on the client, so a plain HTTP
 * POST to `exp.host` is all that is required server-side.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100; // Expo accepts up to 100 messages per request.

/** Only tokens that Expo can actually deliver to. */
const isExpoPushToken = (token) =>
  typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());

/**
 * Sends a notification/broadcast to targeted or all registered devices.
 *
 * @param {{ title: string; message: string; type?: string; data?: Record<string, unknown>; targetType?: string; targetUserId?: string | null; targetTier?: string }} payload
 * @returns {Promise<{ total: number; targeted: number; sent: number; failed: number }>}
 */
export const sendBroadcastPush = async ({
  title,
  message,
  type = 'system',
  data = {},
  targetType = 'all',
  targetUserId = null,
  targetTier = 'all',
}) => {
  let deviceQuery = { isActive: true };

  if (targetType === 'specific_user' && targetUserId) {
    deviceQuery.userId = targetUserId;
  } else if (targetType === 'tier' && targetTier && targetTier !== 'all') {
    let userQuery = {};
    if (targetTier === 'VIP') {
      userQuery = {
        $or: [
          { membershipTier: 'Platinum' },
          { totalSpent: { $gte: 5000 } },
          { totalOrders: { $gte: 5 } },
        ],
      };
    } else if (targetTier === 'Gold') {
      userQuery = {
        $or: [
          { membershipTier: 'Gold' },
          { totalSpent: { $gte: 2500, $lt: 5000 } },
        ],
      };
    } else if (targetTier === 'Regular') {
      userQuery = {
        $or: [
          { membershipTier: { $in: ['Silver', 'Bronze'] } },
          { totalSpent: { $lt: 2500 } },
        ],
      };
    }
    const matchingUsers = await User.find(userQuery).select('_id').lean();
    const userIds = matchingUsers.map((u) => u._id);
    deviceQuery.userId = { $in: userIds };
  }

  const devices = await Device.find(deviceQuery).select('pushToken').lean();
  const tokens = [...new Set(devices.map((d) => d.pushToken).filter(isExpoPushToken))];

  const result = { total: devices.length, targeted: tokens.length, sent: 0, failed: 0 };

  if (!tokens.length) {
    return result;
  }

  if (typeof fetch !== 'function') {
    console.warn('[Push] global fetch is unavailable on this Node runtime — skipping push delivery.');
    result.failed = tokens.length;
    return result;
  }

  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body: message,
    priority: 'high',
    channelId: 'default',
    data,
  }));

  const deadTokens = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      const json = await response.json();
      const tickets = Array.isArray(json?.data) ? json.data : [json?.data].filter(Boolean);

      if (!tickets.length) {
        result.failed += chunk.length;
        continue;
      }

      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          result.sent += 1;
          return;
        }

        result.failed += 1;
        if (ticket?.details?.error === 'DeviceNotRegistered' && chunk[index]) {
          deadTokens.push(chunk[index].to);
        }
      });
    } catch (error) {
      console.error('[Push] Failed to deliver a push batch:', error?.message || error);
      result.failed += chunk.length;
    }
  }

  // Stop targeting tokens Expo says no longer belong to an install.
  if (deadTokens.length) {
    await Device.updateMany(
      { pushToken: { $in: deadTokens } },
      { $set: { isActive: false } }
    );
  }

  return result;
};

export default sendBroadcastPush;
