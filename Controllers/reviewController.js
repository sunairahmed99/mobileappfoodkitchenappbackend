import mongoose from 'mongoose';
import Review from '../Models/Review.js';
import FoodItem from '../Models/FoodItem.js';
import { recomputeCatalogStats } from '../Utils/catalogStats.js';
import { handleControllerError } from '../Utils/errorResponse.js';

const MAX_COMMENT_LENGTH = 1000;

/** Aspect keys the Rate App screen can score. */
export const ASPECT_KEYS = ['food', 'delivery', 'packaging', 'value', 'app', 'support'];

/** Only the aspects the customer actually scored, as a plain object. */
const serializeAspects = (aspects) => {
  if (!aspects) return {};
  const plain = typeof aspects.toObject === 'function' ? aspects.toObject() : aspects;
  return ASPECT_KEYS.reduce((acc, key) => {
    const value = Number(plain[key]);
    if (Number.isFinite(value) && value > 0) acc[key] = value;
    return acc;
  }, {});
};

const serializeReview = (review) => {
  // A populated dish comes back as a document; an unpopulated one as an ObjectId.
  const dish =
    review.foodItemId && typeof review.foodItemId === 'object' && review.foodItemId.name !== undefined
      ? review.foodItemId
      : null;

  return {
    id: String(review._id),
    foodItemId: dish ? String(dish._id) : review.foodItemId ? String(review.foodItemId) : null,
    foodItemName: dish ? dish.name || '' : '',
    userId: String(review.userId?._id || review.userId),
    customerName: review.customerName || review.userId?.name || 'Customer',
    rating: Number(review.rating),
    comment: review.comment || '',
    aspects: serializeAspects(review.aspects),
    isApproved: review.isApproved === true,
    createdAt: new Date(review.createdAt).toISOString(),
  };
};

/**
 * Validates the aspect scores sent by the app. Unknown keys are ignored, a value
 * outside 1-5 is rejected.
 * @returns {{ aspects?: object, error?: string }}
 */
const normalizeAspects = (input) => {
  if (input === undefined || input === null) return { aspects: undefined };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Aspect ratings must be sent as an object.' };
  }

  const aspects = {};
  for (const key of ASPECT_KEYS) {
    const value = input[key];
    if (value === undefined || value === null || value === '') continue;

    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
      return { error: 'Aspect ratings must be whole numbers between 1 and 5.' };
    }
    aspects[key] = numeric;
  }

  return { aspects: Object.keys(aspects).length > 0 ? aspects : undefined };
};

/** Recomputes the derived ranking fields for the dish's category. */
const refreshDishStats = async (foodItemId) => {
  if (!foodItemId) return;
  const item = await FoodItem.findById(foodItemId).select('categoryId').lean();
  if (!item) return;
  try {
    await recomputeCatalogStats({ categoryId: item.categoryId });
  } catch (error) {
    // A stale ranking must never fail a review the customer already submitted.
    console.error('Catalog stats refresh failed:', error.message);
  }
};

/**
 * @desc  List a dish's *approved* reviews plus its rating summary (public)
 * @route GET /api/reviews/food-item/:foodItemId
 */
export const getFoodItemReviews = async (req, res) => {
  try {
    const { foodItemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(foodItemId)) {
      return res.status(400).json({ success: false, message: 'Invalid id format' });
    }

    // Pending reviews are never exposed to shoppers — an admin approves them first.
    const reviews = await Review.find({ foodItemId, isApproved: true }).sort({ createdAt: -1 }).lean();
    const total = reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0);

    res.json({
      success: true,
      count: reviews.length,
      averageRating: reviews.length ? Math.round((total / reviews.length) * 10) / 10 : 0,
      data: reviews.map(serializeReview),
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while fetching reviews');
  }
};

/**
 * @desc  List every review for the admin dashboard (pending + approved)
 * @route GET /api/reviews
 * @access Admin
 */
export const getAllReviews = async (req, res) => {
  try {
    const { status, rating, search } = req.query;
    const filter = {};

    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin) {
      filter.isApproved = true;
    } else {
      if (status === 'approved') filter.isApproved = true;
      else if (status === 'pending') filter.isApproved = { $ne: true };
    }

    if (rating !== undefined && rating !== '') {
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ success: false, message: 'Rating filter must be between 1 and 5.' });
      }
      filter.rating = numericRating;
    }

    if (search) {
      const pattern = String(search).trim();
      if (pattern) {
        filter.$or = [
          { customerName: { $regex: pattern, $options: 'i' } },
          { comment: { $regex: pattern, $options: 'i' } },
        ];
      }
    }

    const reviews = await Review.find(filter).sort({ createdAt: -1 }).populate('foodItemId', 'name').lean();

    res.json({
      success: true,
      count: reviews.length,
      pending: reviews.filter((review) => review.isApproved !== true).length,
      data: reviews.map(serializeReview),
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while fetching reviews');
  }
};

/**
 * @desc  Create or update the signed-in customer's review (dish or app rating)
 * @route POST /api/reviews
 */
export const upsertReview = async (req, res) => {
  try {
    const { foodItemId, rating, comment = '', orderId = '' } = req.body || {};

    // A dish review must reference a real dish; an app rating carries no dish id.
    const hasDish = foodItemId !== undefined && foodItemId !== null && foodItemId !== '';
    if (hasDish && !mongoose.Types.ObjectId.isValid(foodItemId)) {
      return res.status(400).json({ success: false, message: 'A valid dish is required.' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a whole number between 1 and 5.' });
    }

    const trimmedComment = String(comment ?? '').trim();
    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Review comment cannot be longer than ${MAX_COMMENT_LENGTH} characters.`,
      });
    }

    const { aspects, error: aspectError } = normalizeAspects(req.body?.aspects);
    if (aspectError) {
      return res.status(400).json({ success: false, message: aspectError });
    }

    const dishId = hasDish ? foodItemId : null;
    if (dishId) {
      const dish = await FoodItem.findById(dishId).select('_id').lean();
      if (!dish) return res.status(404).json({ success: false, message: 'Dish not found.' });
    }

    const customerName = req.user?.name || 'Customer';
    const existing = await Review.findOne({ foodItemId: dishId, userId: req.user._id });

    let review;
    if (existing) {
      existing.rating = numericRating;
      existing.comment = trimmedComment;
      existing.customerName = customerName;
      if (aspects) existing.aspects = aspects;
      if (orderId) existing.orderId = String(orderId).slice(0, 120);
      // Edited feedback has to pass moderation again before shoppers can see it.
      existing.isApproved = false;
      review = await existing.save();
    } else {
      review = await Review.create({
        foodItemId: dishId,
        userId: req.user._id,
        customerName,
        orderId: String(orderId || '').slice(0, 120),
        rating: numericRating,
        comment: trimmedComment,
        aspects,
        isApproved: false,
      });
    }

    await refreshDishStats(dishId);

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing ? 'Review updated' : 'Review submitted',
      data: serializeReview(review),
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while saving your review');
  }
};

/**
 * @desc  Approve or un-approve a review — controls whether the app shows it
 * @route PATCH /api/reviews/:id/approve
 * @access Admin
 */
export const toggleReviewApproval = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    review.isApproved = !review.isApproved;
    await review.save();

    // Approval changes the rating the storefront shows for the dish.
    await refreshDishStats(review.foodItemId);

    res.json({
      success: true,
      message: review.isApproved
        ? 'Review approved — now visible in the app'
        : 'Review un-approved — hidden from the app',
      data: serializeReview(review),
    });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while updating the review status');
  }
};

/**
 * @desc  Delete a review (its author or an admin)
 * @route DELETE /api/reviews/:id
 */
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    const isOwner = String(review.userId) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You can only delete your own review.' });
    }

    const { foodItemId } = review;
    await review.deleteOne();
    await refreshDishStats(foodItemId);

    res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    return handleControllerError(res, err, 'Server error while deleting review');
  }
};
