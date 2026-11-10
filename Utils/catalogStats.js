import FoodItem from '../Models/FoodItem.js';
import Order from '../Models/Order.js';
import Review from '../Models/Review.js';

/**
 * Derives the storefront ranking fields (`avgRating`, `reviewsCount`, `soldCount`,
 * `isBestseller`, `isTopRated`) from real data:
 *
 *   - ratings come from the Review collection (one row per customer per dish);
 *   - sales come from non-cancelled Orders.
 *
 * The admin-entered `rating` / `isPopular` values are never overwritten - they act
 * as the seed while a category has no reviews or sales yet, so a fresh catalogue
 * does not end up with empty "Top Rated" / "Bestsellers" chips.
 */

/** How many dishes per category get flagged. */
export const BESTSELLER_LIMIT = 3;
export const TOP_RATED_LIMIT = 3;

/** Minimum review average for a dish to be considered for "Top Rated". */
export const TOP_RATED_MIN_RATING = 4.5;

/** Minimum number of reviews before a dish counts as genuinely rated. */
export const TOP_RATED_MIN_REVIEWS = 1;

const OBJECT_ID_PREFIX = /^[a-f\d]{24}/i;

/**
 * Cart ids are built as `${foodItemId}-${serving}` (see category/[id].tsx), so an
 * order line's productId is not always a bare FoodItem id. The dish is always
 * identified by the leading ObjectId.
 */
export const foodItemIdFromProductId = (productId) => {
  const match = String(productId ?? '').match(OBJECT_ID_PREFIX);
  return match ? match[0] : '';
};

/** Quantity sold per FoodItem id, ignoring cancelled orders. */
const collectSoldCounts = async () => {
  const orders = await Order.find({ status: { $ne: 'Cancelled' } }).lean();
  const sold = new Map();

  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      // Only dishes map to a FoodItem; deals / frozen packs have their own ids.
      if (!item || item.type !== 'dish') return;
      const id = foodItemIdFromProductId(item.productId);
      const quantity = Number(item.quantity) || 0;
      if (!id || quantity <= 0) return;
      sold.set(id, (sold.get(id) || 0) + quantity);
    });
  });

  return sold;
};

/** Review count and rating total per FoodItem id (approved reviews only). */
const collectReviewStats = async (foodItemIds) => {
  const stats = new Map();
  if (!foodItemIds.length) return stats;

  // Pending reviews must not influence the rating a shopper sees.
  const reviews = await Review.find({ foodItemId: { $in: foodItemIds }, isApproved: true }).lean();
  reviews.forEach((review) => {
    const id = String(review.foodItemId);
    const entry = stats.get(id) || { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(review.rating) || 0;
    stats.set(id, entry);
  });

  return stats;
};

const groupByCategory = (items) => {
  const groups = new Map();
  items.forEach((item) => {
    const key = String(item.categoryId?._id || item.categoryId || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
};

/** Displayed rating: the real review average once reviewed, else the admin seed. */
export const effectiveRating = (item, reviewStats) => {
  const stats = reviewStats?.get(String(item._id));
  if (stats && stats.count >= TOP_RATED_MIN_REVIEWS) {
    return stats.total / stats.count;
  }
  return Number(item.rating) || 0;
};

/**
 * Recomputes the ranking fields for every food item, or for a single category.
 * Safe to call repeatedly; it is a pure function of the orders and reviews stored.
 */
export const recomputeCatalogStats = async ({ categoryId } = {}) => {
  const items = await FoodItem.find(categoryId ? { categoryId } : {}).lean();
  if (!items.length) return { items: 0, updated: 0 };

  const ids = items.map((item) => String(item._id));
  const sold = await collectSoldCounts();
  const reviewStats = await collectReviewStats(ids);

  const operations = [];

  groupByCategory(items).forEach((group) => {
    const hasSales = group.some((item) => (sold.get(String(item._id)) || 0) > 0);
    const hasReviews = group.some(
      (item) => (reviewStats.get(String(item._id))?.count || 0) >= TOP_RATED_MIN_REVIEWS
    );

    // Bestsellers: real order volume when the category has any, else the admin's
    // explicit `isPopular` marks.
    const bestsellers = new Set();
    if (hasSales) {
      group
        .filter((item) => (sold.get(String(item._id)) || 0) > 0)
        .sort((a, b) => (sold.get(String(b._id)) || 0) - (sold.get(String(a._id)) || 0))
        .slice(0, BESTSELLER_LIMIT)
        .forEach((item) => bestsellers.add(String(item._id)));
    } else {
      group.filter((item) => item.isPopular).forEach((item) => bestsellers.add(String(item._id)));
    }

    // Top rated: real review averages when the category has any reviews, else the
    // admin-entered rating.
    const topRated = new Set(
      group
        .filter((item) => {
          const reviews = reviewStats.get(String(item._id))?.count || 0;
          if (hasReviews && reviews < TOP_RATED_MIN_REVIEWS) return false;
          return effectiveRating(item, reviewStats) >= TOP_RATED_MIN_RATING;
        })
        .sort((a, b) => effectiveRating(b, reviewStats) - effectiveRating(a, reviewStats))
        .slice(0, TOP_RATED_LIMIT)
        .map((item) => String(item._id))
    );

    group.forEach((item) => {
      const id = String(item._id);
      const stats = reviewStats.get(id);
      const reviewsCount = stats?.count || 0;

      operations.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              reviewsCount,
              avgRating: reviewsCount > 0 ? Math.round((stats.total / reviewsCount) * 10) / 10 : 0,
              soldCount: sold.get(id) || 0,
              isBestseller: bestsellers.has(id),
              isTopRated: topRated.has(id),
            },
          },
        },
      });
    });
  });

  if (!operations.length) return { items: items.length, updated: 0 };

  const result = await FoodItem.bulkWrite(operations, { ordered: false });
  return { items: items.length, updated: result?.modifiedCount ?? operations.length };
};

export default recomputeCatalogStats;
