import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    storeName: {
      type: String,
      default: 'FOOD KITCHEN',
      trim: true,
    },
    logoUrl: {
      type: String,
      default: '',
      trim: true,
    },
    tagline: {
      type: String,
      default: 'Special Homemade Taste',
      trim: true,
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    deliveryFee: {
      type: Number,
      default: 99,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 400,
      min: 0,
    },
    announcement: {
      type: String,
      default: 'Special Homemade Taste delivered fresh & hot to your doorstep! 🍲✨',
      trim: true,
    },
    estimatedDeliveryTime: {
      type: String,
      default: '30-45 mins',
      trim: true,
    },
    jazzcashNumber: {
      type: String,
      default: '',
      trim: true,
    },
    jazzcashAccountTitle: {
      type: String,
      default: '',
      trim: true,
    },
    easypaisaNumber: {
      type: String,
      default: '',
      trim: true,
    },
    easypaisaAccountTitle: {
      type: String,
      default: '',
      trim: true,
    },
    whatsappNumber: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

export default Settings;
