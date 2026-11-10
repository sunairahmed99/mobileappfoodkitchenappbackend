import mongoose from 'mongoose';

const dealSchema = new mongoose.Schema(
  {
    dealTitle: {
      type: String,
      required: [true, 'Deal title is required'],
      trim: true,
    },
    tagline: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    itemsIncluded: {
      type: [String],
      default: [],
    },
    originalPrice: {
      type: Number,
      required: [true, 'Original price is required'],
      min: [0, 'Original price cannot be negative'],
    },
    dealPrice: {
      type: Number,
      required: [true, 'Deal price is required'],
      min: [0, 'Deal price cannot be negative'],
    },
    discountPercentage: {
      type: String,
      default: '',
    },
    savedAmount: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 4.8,
      min: 1,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 120,
    },
    prepTime: {
      type: String,
      default: '20-25 mins',
    },
    serves: {
      type: String,
      default: '2 Persons',
    },
    imageUrl: {
      type: String,
      required: [true, 'Deal image URL is required'],
    },
    cloudinaryId: {
      type: String,
      default: null,
    },
    badge: {
      type: String,
      default: '',
    },
    isBestseller: {
      type: Boolean,
      default: false,
    },
    isWeeklyDeal: {
      type: Boolean,
      default: true,
    },
    day: {
      type: String,
      default: '',
    },
    shortDay: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['combo', 'family', 'budget', 'bbq', 'frozen', 'special'],
      default: 'combo',
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

// Pre-save hook to calculate savedAmount and discountPercentage if not provided
dealSchema.pre('save', async function () {
  if (this.originalPrice && this.dealPrice) {
    if (this.originalPrice > this.dealPrice) {
      this.savedAmount = this.originalPrice - this.dealPrice;
      const pct = Math.round(((this.originalPrice - this.dealPrice) / this.originalPrice) * 100);
      if (!this.discountPercentage || this.discountPercentage.trim() === '') {
        this.discountPercentage = `${pct}% OFF`;
      }
    } else {
      this.savedAmount = 0;
    }
  }
});

dealSchema.index({ isActive: 1, order: 1 });
dealSchema.index({ type: 1, isActive: 1 });
dealSchema.index({ isWeeklyDeal: 1, isActive: 1 });

const Deal = mongoose.model('Deal', dealSchema);

export default Deal;
