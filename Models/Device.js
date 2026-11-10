import mongoose from 'mongoose';

/**
 * A registered app install / device.
 *
 * Every installed app registers its Expo push token here (even before a user
 * logs in), which is what makes "send to all installed apps" possible.
 * Tokens the push service reports as `DeviceNotRegistered` are flipped to
 * `isActive: false` instead of being deleted, so a re-install can revive them.
 */
const deviceSchema = new mongoose.Schema(
  {
    pushToken: {
      type: String,
      required: [true, 'Push token is required'],
      unique: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web', 'unknown'],
      default: 'unknown',
    },
    deviceName: {
      type: String,
      default: '',
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

deviceSchema.index({ isActive: 1 });

const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);

export default Device;
