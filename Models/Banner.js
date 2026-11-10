import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: '',
    },
    subtitle: {
      type: String,
      trim: true,
      default: '',
    },
    tag: {
      type: String,
      trim: true,
      default: 'SPECIAL OFFER',
    },
    discount: {
      type: String,
      trim: true,
      default: '',
    },
    buttonText: {
      type: String,
      trim: true,
      default: 'Order Now',
    },
    imageUrl: {
      type: String,
      required: [true, 'Banner image URL is required'],
    },
    cloudinaryId: {
      type: String,
      default: null,
    },
    backgroundColor: {
      type: String,
      default: '#1E1B18',
    },
    accentColor: {
      type: String,
      default: '#EE4D2D',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Banner = mongoose.model('Banner', bannerSchema);

export default Banner;
