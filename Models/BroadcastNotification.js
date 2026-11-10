import mongoose from 'mongoose';

/**
 * A single admin-composed announcement that is pushed to every installed device.
 * `deliveredCount` / `failedCount` are filled in after the Expo push batch returns.
 */
const broadcastNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Announcement title is required'],
      trim: true,
      maxlength: [120, 'Title is too long'],
    },
    message: {
      type: String,
      required: [true, 'Announcement message is required'],
      trim: true,
      maxlength: [1000, 'Message is too long'],
    },
    type: {
      type: String,
      enum: ['order', 'offer', 'system'],
      default: 'system',
    },
    icon: {
      type: String,
      default: '',
      trim: true,
    },
    iconBg: {
      type: String,
      default: '',
      trim: true,
    },
    iconColor: {
      type: String,
      default: '',
      trim: true,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentByName: {
      type: String,
      default: 'Admin',
      trim: true,
    },
    deliveredCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pushSent: {
      type: Boolean,
      default: false,
    },
    targetType: {
      type: String,
      enum: ['all', 'specific_user', 'tier'],
      default: 'all',
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    targetUserName: {
      type: String,
      default: '',
      trim: true,
    },
    targetTier: {
      type: String,
      enum: ['all', 'VIP', 'Gold', 'Regular'],
      default: 'all',
    },
    discountCode: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

broadcastNotificationSchema.index({ createdAt: -1 });

const BroadcastNotification =
  mongoose.models.BroadcastNotification ||
  mongoose.model('BroadcastNotification', broadcastNotificationSchema);

export default BroadcastNotification;
