import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title or Order Number is required'],
      trim: true,
      maxlength: 150,
    },
    customerName: {
      type: String,
      default: 'Valued Customer',
      trim: true,
      maxlength: 120,
    },
    destinationArea: {
      type: String,
      default: 'Lahore',
      trim: true,
      maxlength: 200,
    },
    itemsDescription: {
      type: String,
      required: [true, 'Description or items detail is required'],
      trim: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      enum: ['Fresh Cooked', 'Frozen Packs', 'Weekly Sub', 'Party Deal', 'Kitchen Story', 'Recipe'],
      default: 'Fresh Cooked',
    },
    photoUrl: {
      type: String,
      required: [true, 'Blog or dispatch photo URL is required'],
      trim: true,
    },
    cloudinaryId: {
      type: String,
      default: null,
    },
    dispatchedAt: {
      type: String,
      default: '',
      trim: true,
    },
    riderName: {
      type: String,
      default: 'Kitchen Dispatch Team',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Dispatched', 'Out for Delivery', 'Delivered', 'Published'],
      default: 'Out for Delivery',
    },
    sealVerified: {
      type: Boolean,
      default: true,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

blogSchema.index({ category: 1, createdAt: -1 });
blogSchema.index({ isPublished: 1, createdAt: -1 });

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
