import mongoose from 'mongoose';

/**
 * Optional per-aspect scores sent by the "Rate App" screen. Every key is
 * optional because a customer may rate only some aspects.
 */
const aspectsSchema = new mongoose.Schema(
  {
    food: { type: Number, min: 1, max: 5 },
    delivery: { type: Number, min: 1, max: 5 },
    packaging: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    app: { type: Number, min: 1, max: 5 },
    support: { type: Number, min: 1, max: 5 },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    // `null` marks an app/service review (no specific dish) — see the Rate App screen.
    foodItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    orderId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating cannot be less than 1'],
      max: [5, 'Rating cannot be more than 5'],
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    aspects: {
      type: aspectsSchema,
      default: undefined,
    },
    // Moderation gate: nothing reaches the storefront until an admin approves it.
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// One review per customer per dish (and one app review per customer, since its
// foodItemId is null): re-submitting updates the existing review.
reviewSchema.index({ foodItemId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ foodItemId: 1, createdAt: -1 });
reviewSchema.index({ isApproved: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
