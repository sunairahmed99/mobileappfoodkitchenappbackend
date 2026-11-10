import mongoose from 'mongoose';

const servingOptionSchema = new mongoose.Schema({
  id:           { type: String, required: true },
  persons:      { type: String, required: true },   // 'For 2 Persons'
  portionLabel: { type: String, required: true },   // 'Regular Serving (2 Portions)'
  price:        { type: Number, default: 0 },
}, { _id: false });

const foodItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Food item name is required'],
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
    },
    originalPrice: {
      type: Number,
      default: 0,
    },
    tag: {
      type: String,
      default: 'Special',
    },
    tagColor: {
      type: String,
      default: '#EE4D2D',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    cloudinaryId: {
      type: String,
      default: null,
    },
    prepTime: {
      type: String,
      default: '20 mins',
    },
    // Admin-entered fallback rating, used until the dish collects real reviews.
    rating: {
      type: Number,
      default: 4.5,
      min: 0,
      max: 5,
    },
    // Derived from the Review collection by Utils/catalogStats.js.
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Derived from non-cancelled orders by Utils/catalogStats.js.
    soldCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isBestseller: {
      type: Boolean,
      default: false,
    },
    isTopRated: {
      type: Boolean,
      default: false,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isNew: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    servingOptions: {
      type: [servingOptionSchema],
      default: [],
    },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

foodItemSchema.index({ categoryId: 1, isActive: 1, order: 1 });
foodItemSchema.index({ isPopular: 1, isActive: 1 });
foodItemSchema.index({ isBestseller: 1, isActive: 1 });
foodItemSchema.index({ isTopRated: 1, isActive: 1 });

const FoodItem = mongoose.model('FoodItem', foodItemSchema);
export default FoodItem;
