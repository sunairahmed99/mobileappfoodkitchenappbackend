// Ranking derivation: `isBestseller` / `isTopRated` / `soldCount` / `avgRating`
// must come from real orders and reviews, falling back to the admin-entered
// values only while a category has no real data yet.
jest.mock('../Models/User.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').User }));
jest.mock('../Models/Banner.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Banner }));
jest.mock('../Models/Category.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Category }));
jest.mock('../Models/Deal.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Deal }));
jest.mock('../Models/FoodItem.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').FoodItem }));
jest.mock('../Models/Order.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Order }));
jest.mock('../Models/Review.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Review }));
jest.mock('../Models/Settings.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Settings }));

import { FoodItem, Order, Review, query, resetModelMocks } from './helpers/modelMocks.cjs';
import {
  BESTSELLER_LIMIT,
  foodItemIdFromProductId,
  recomputeCatalogStats,
} from '../Utils/catalogStats.js';

const CATEGORY = '507f1f77bcf86cd799439aaa';
const A = '507f1f77bcf86cd799439a01';
const B = '507f1f77bcf86cd799439a02';
const C = '507f1f77bcf86cd799439a03';
const D = '507f1f77bcf86cd799439a04';
const E = '507f1f77bcf86cd799439a05';

const dish = (id, over = {}) => ({ _id: id, categoryId: CATEGORY, rating: 4.5, isPopular: false, ...over });
const order = (items) => ({ status: 'Delivered', items });

/** The `$set` payload bulkWrite received, keyed by food item id. */
const updatesById = () => {
  const [operations] = FoodItem.bulkWrite.mock.calls[0];
  return Object.fromEntries(
    operations.map((op) => [String(op.updateOne.filter._id), op.updateOne.update.$set])
  );
};

beforeEach(() => {
  resetModelMocks();
});

describe('foodItemIdFromProductId', () => {
  test('accepts a bare ObjectId', () => {
    expect(foodItemIdFromProductId(A)).toBe(A);
  });

  test('strips the serving suffix used by cart ids', () => {
    expect(foodItemIdFromProductId(`${A}-For 2 Persons`)).toBe(A);
  });

  test('returns empty for ids that are not ObjectIds', () => {
    expect(foodItemIdFromProductId('deal-combo-1')).toBe('');
    expect(foodItemIdFromProductId(undefined)).toBe('');
  });
});

describe('recomputeCatalogStats', () => {
  test('only touches the requested category', async () => {
    FoodItem.find.mockImplementation(() => query([]));
    Order.find.mockImplementation(() => query([]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    expect(FoodItem.find).toHaveBeenCalledWith({ categoryId: CATEGORY });
  });

  test('does nothing when the category has no dishes', async () => {
    FoodItem.find.mockImplementation(() => query([]));

    const result = await recomputeCatalogStats({ categoryId: CATEGORY });

    expect(result).toEqual({ items: 0, updated: 0 });
    expect(FoodItem.bulkWrite).not.toHaveBeenCalled();
  });

  test('derives bestsellers from real dish sales and ignores deals and cancelled orders', async () => {
    FoodItem.find.mockImplementation(() => query([
      dish(A, { isPopular: true }),
      dish(B),
      dish(C, { isPopular: true }),
    ]));
    Order.find.mockImplementation(() => query([
      order([
        { type: 'dish', productId: `${A}-For 2 Persons`, quantity: 5 },
        { type: 'dish', productId: B, quantity: 2 },
        { type: 'deal', productId: D, quantity: 99 },
      ]),
    ]));
    Review.find.mockImplementation(() => query([]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    // Cancelled orders must not count as sales.
    expect(Order.find).toHaveBeenCalledWith({ status: { $ne: 'Cancelled' } });

    const updates = updatesById();
    expect(updates[A]).toMatchObject({ soldCount: 5, isBestseller: true });
    expect(updates[B]).toMatchObject({ soldCount: 2, isBestseller: true });
    // Real sales exist, so the admin's isPopular mark no longer decides.
    expect(updates[C]).toMatchObject({ soldCount: 0, isBestseller: false });
  });

  test(`flags at most ${BESTSELLER_LIMIT} bestsellers per category`, async () => {
    FoodItem.find.mockImplementation(() => query([dish(A), dish(B), dish(C), dish(D), dish(E)]));
    Order.find.mockImplementation(() => query([
      order([A, B, C, D, E].map((id, index) => ({
        type: 'dish',
        productId: id,
        quantity: index + 1,
      }))),
    ]));
    Review.find.mockImplementation(() => query([]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    const updates = updatesById();
    expect(Object.values(updates).filter((u) => u.isBestseller)).toHaveLength(BESTSELLER_LIMIT);
    // Highest volume first: E(5), D(4), C(3) win, B(2) and A(1) lose.
    expect(updates[E].isBestseller).toBe(true);
    expect(updates[B].isBestseller).toBe(false);
  });

  test('falls back to the admin isPopular flag while a category has no sales', async () => {
    FoodItem.find.mockImplementation(() => query([dish(A, { isPopular: true }), dish(B)]));
    Order.find.mockImplementation(() => query([]));
    Review.find.mockImplementation(() => query([]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    const updates = updatesById();
    expect(updates[A]).toMatchObject({ isBestseller: true, soldCount: 0 });
    expect(updates[B]).toMatchObject({ isBestseller: false });
  });

  test('stores the real review aggregate and prefers it for top rated', async () => {
    FoodItem.find.mockImplementation(() => query([dish(A, { rating: 4.9 }), dish(D)]));
    Order.find.mockImplementation(() => query([]));
    Review.find.mockImplementation(() => query([
      { foodItemId: D, rating: 5 },
      { foodItemId: D, rating: 4 },
    ]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    const updates = updatesById();
    expect(updates[D]).toMatchObject({ reviewsCount: 2, avgRating: 4.5 });
    // D is backed by real reviews, A only by the admin number, so D is top rated.
    expect(updates[D].isTopRated).toBe(true);
    expect(updates[A]).toMatchObject({ reviewsCount: 0, avgRating: 0, isTopRated: false });
  });

  test('falls back to the admin rating for top rated while a category has no reviews', async () => {
    FoodItem.find.mockImplementation(() => query([
      dish(A, { rating: 4.9 }),
      dish(B, { rating: 4.8 }),
      dish(C, { rating: 4.6 }),
      dish(D, { rating: 4.2 }),
    ]));
    Order.find.mockImplementation(() => query([]));
    Review.find.mockImplementation(() => query([]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    const updates = updatesById();
    expect(updates[A].isTopRated).toBe(true);
    expect(updates[B].isTopRated).toBe(true);
    expect(updates[C].isTopRated).toBe(true);
    expect(updates[D].isTopRated).toBe(false);
  });

  test('never overwrites the admin-entered rating field', async () => {
    FoodItem.find.mockImplementation(() => query([dish(A, { rating: 4.2 })]));
    Order.find.mockImplementation(() => query([]));
    Review.find.mockImplementation(() => query([{ foodItemId: A, rating: 5 }]));

    await recomputeCatalogStats({ categoryId: CATEGORY });

    expect(updatesById()[A]).not.toHaveProperty('rating');
  });
});
