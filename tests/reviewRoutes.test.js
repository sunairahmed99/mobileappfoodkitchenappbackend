// Reviews API + the admin catalog-stats recompute endpoint.
jest.mock('../Config/db.js', () => ({ __esModule: true, default: jest.fn(() => Promise.resolve()) }));
jest.mock('../Config/seeder.js', () => ({ __esModule: true, seedDatabaseIfEmpty: jest.fn() }));
jest.mock('../Config/cloudinary.js', () => ({
  __esModule: true,
  uploadToCloudinary: jest.fn(() => Promise.resolve({ secure_url: 'http://mock.local/img.png', public_id: 'mock-public-id' })),
  deleteFromCloudinary: jest.fn(() => Promise.resolve({ result: 'ok' })),
  default: {},
}));
jest.mock('../Config/email.js', () => ({
  __esModule: true,
  sendEmail: jest.fn(() => Promise.resolve({ success: true })),
  default: {},
}));
jest.mock('../Models/User.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').User }));
jest.mock('../Models/Banner.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Banner }));
jest.mock('../Models/Category.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Category }));
jest.mock('../Models/Deal.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Deal }));
jest.mock('../Models/FoodItem.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').FoodItem }));
jest.mock('../Models/Order.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Order }));
jest.mock('../Models/Review.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Review }));
jest.mock('../Models/Settings.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Settings }));

import request from 'supertest';
import app from '../app.js';
import {
  FoodItem,
  Order,
  Review,
  User,
  query,
  resetModelMocks,
  signToken,
  userDoc,
} from './helpers/modelMocks.cjs';

const DISH_ID = '507f1f77bcf86cd799439a01';
const REVIEW_ID = '507f1f77bcf86cd799439b01';
const CATEGORY = '507f1f77bcf86cd799439aaa';
const MALFORMED_ID = 'not-a-valid-objectid';

const userToken = () => signToken({ id: 'user-1', role: 'user' });
const adminToken = () => signToken({ id: 'admin-1', role: 'admin' });
const asRole = (role) => User.findById.mockImplementation(() => query(userDoc({ role })));
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const reviewDoc = (over = {}) => ({
  _id: REVIEW_ID,
  foodItemId: DISH_ID,
  userId: '507f1f77bcf86cd799439011',
  customerName: 'Test User',
  rating: 4,
  comment: 'Great',
  createdAt: new Date('2024-05-01T10:00:00Z'),
  save: jest.fn(function save() { return Promise.resolve(this); }),
  deleteOne: jest.fn(() => Promise.resolve()),
  ...over,
});

beforeEach(() => {
  resetModelMocks();
  asRole('user');
});

describe('GET /api/reviews/food-item/:foodItemId', () => {
  test('rejects a malformed dish id with 400', async () => {
    const res = await request(app).get(`/api/reviews/food-item/${MALFORMED_ID}`);
    expect(res.status).toBe(400);
  });

  test('returns the reviews with their average', async () => {
    Review.find.mockImplementation(() => query([reviewDoc({ rating: 5 }), reviewDoc({ _id: 'r2', rating: 4 })]));

    const res = await request(app).get(`/api/reviews/food-item/${DISH_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.averageRating).toBe(4.5);
    expect(res.body.data[0]).toMatchObject({ foodItemId: DISH_ID, rating: 5 });
  });

  test('reports an average of 0 when the dish has no reviews', async () => {
    Review.find.mockImplementation(() => query([]));

    const res = await request(app).get(`/api/reviews/food-item/${DISH_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 0, averageRating: 0 });
  });
});

describe('POST /api/reviews', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/reviews').send({ foodItemId: DISH_ID, rating: 5 });
    expect(res.status).toBe(401);
  });

  test('rejects a malformed dish id with 400', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: MALFORMED_ID, rating: 5 });
    expect(res.status).toBe(400);
  });

  test.each([0, 6, 3.5, 'abc', undefined])('rejects the out-of-range rating %p with 400', async (rating) => {
    const res = await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: DISH_ID, rating });
    expect(res.status).toBe(400);
  });

  test('returns 404 when the dish does not exist', async () => {
    FoodItem.findById.mockImplementation(() => query(null));

    const res = await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: DISH_ID, rating: 5 });

    expect(res.status).toBe(404);
  });

  test('creates a review with 201', async () => {
    FoodItem.findById.mockImplementation(() => query({ _id: DISH_ID, categoryId: CATEGORY }));
    Review.findOne.mockImplementation(() => query(null));
    Review.create.mockImplementation((doc) => Promise.resolve(reviewDoc({ ...doc, rating: doc.rating })));

    const res = await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: DISH_ID, rating: 5, comment: 'Delicious' });

    expect(res.status).toBe(201);
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ foodItemId: DISH_ID, rating: 5, comment: 'Delicious' })
    );
    expect(res.body.data).toMatchObject({ rating: 5, foodItemId: DISH_ID });
  });

  test('updates the existing review of the same customer with 200', async () => {
    const existing = reviewDoc({ rating: 3 });
    FoodItem.findById.mockImplementation(() => query({ _id: DISH_ID, categoryId: CATEGORY }));
    Review.findOne.mockImplementation(() => query(existing));

    const res = await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: DISH_ID, rating: 2, comment: 'Changed my mind' });

    expect(res.status).toBe(200);
    expect(existing.rating).toBe(2);
    expect(existing.comment).toBe('Changed my mind');
    expect(Review.create).not.toHaveBeenCalled();
    expect(res.body.data.rating).toBe(2);
  });

  test('refreshes the ranking fields for the dish category', async () => {
    FoodItem.findById.mockImplementation(() => query({ _id: DISH_ID, categoryId: CATEGORY }));
    FoodItem.find.mockImplementation(() => query([{ _id: DISH_ID, categoryId: CATEGORY, rating: 4, isPopular: false }]));
    Order.find.mockImplementation(() => query([]));
    Review.findOne.mockImplementation(() => query(null));
    Review.create.mockImplementation((doc) => Promise.resolve(reviewDoc(doc)));

    await request(app)
      .post('/api/reviews')
      .set(auth(userToken()))
      .send({ foodItemId: DISH_ID, rating: 5 });

    expect(Order.find).toHaveBeenCalledWith({ status: { $ne: 'Cancelled' } });
    expect(FoodItem.find).toHaveBeenCalledWith({ categoryId: CATEGORY });
  });
});

describe('DELETE /api/reviews/:id', () => {
  test('returns 404 for an unknown review', async () => {
    Review.findById.mockImplementation(() => query(null));

    const res = await request(app).delete(`/api/reviews/${REVIEW_ID}`).set(auth(userToken()));
    expect(res.status).toBe(404);
  });

  test('refuses to delete another customer review', async () => {
    Review.findById.mockImplementation(() => query(reviewDoc({ userId: 'someone-else' })));

    const res = await request(app).delete(`/api/reviews/${REVIEW_ID}`).set(auth(userToken()));
    expect(res.status).toBe(403);
  });

  test('deletes the review of the signed-in customer', async () => {
    const review = reviewDoc();
    Review.findById.mockImplementation(() => query(review));

    const res = await request(app).delete(`/api/reviews/${REVIEW_ID}`).set(auth(userToken()));

    expect(res.status).toBe(200);
    expect(review.deleteOne).toHaveBeenCalled();
  });

  test('lets an admin delete any review', async () => {
    const review = reviewDoc({ userId: 'someone-else' });
    Review.findById.mockImplementation(() => query(review));
    asRole('admin');

    const res = await request(app).delete(`/api/reviews/${REVIEW_ID}`).set(auth(adminToken()));

    expect(res.status).toBe(200);
    expect(review.deleteOne).toHaveBeenCalled();
  });
});

describe('POST /api/food-items/recompute-stats', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/food-items/recompute-stats');
    expect(res.status).toBe(401);
  });

  test('requires an admin', async () => {
    const res = await request(app).post('/api/food-items/recompute-stats').set(auth(userToken()));
    expect(res.status).toBe(403);
  });

  test('recomputes the whole catalog for an admin', async () => {
    asRole('admin');
    FoodItem.find.mockImplementation(() => query([{ _id: DISH_ID, categoryId: CATEGORY, rating: 4, isPopular: false }]));
    Order.find.mockImplementation(() => query([]));
    Review.find.mockImplementation(() => query([]));

    const res = await request(app).post('/api/food-items/recompute-stats').set(auth(adminToken()));

    expect(res.status).toBe(200);
    expect(FoodItem.find).toHaveBeenCalledWith({});
    expect(res.body.items).toBe(1);
  });

  test('scopes the recompute to a category when asked', async () => {
    asRole('admin');
    FoodItem.find.mockImplementation(() => query([]));

    await request(app)
      .post(`/api/food-items/recompute-stats?categoryId=${CATEGORY}`)
      .set(auth(adminToken()));

    expect(FoodItem.find).toHaveBeenCalledWith({ categoryId: CATEGORY });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Review moderation (approval gate)', () => {
  describe('GET /api/reviews/food-item/:foodItemId', () => {
    test('only asks the database for approved reviews', async () => {
      Review.find.mockImplementation(() => query([]));

      await request(app).get(`/api/reviews/food-item/${DISH_ID}`);

      expect(Review.find).toHaveBeenCalledWith({ foodItemId: DISH_ID, isApproved: true });
    });
  });

  describe('GET /api/reviews (admin list)', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/reviews');
      expect(res.status).toBe(401);
    });

    test('rejects a non-admin token with 403', async () => {
      const res = await request(app).get('/api/reviews').set(auth(userToken()));
      expect(res.status).toBe(403);
    });

    test('returns every review with its approval state, dish name and pending count', async () => {
      asRole('admin');
      Review.find.mockImplementation(() => query([
        reviewDoc({ isApproved: true, foodItemId: { _id: DISH_ID, name: 'Chicken Biryani' } }),
        reviewDoc({
          _id: 'r2',
          rating: 3,
          isApproved: false,
          foodItemId: null,
          comment: 'App is slow',
          aspects: { food: 4, delivery: 2 },
        }),
      ]));

      const res = await request(app).get('/api/reviews').set(auth(adminToken()));

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.pending).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        isApproved: true,
        foodItemId: DISH_ID,
        foodItemName: 'Chicken Biryani',
      });
      expect(res.body.data[1]).toMatchObject({
        isApproved: false,
        foodItemId: null,
        aspects: { food: 4, delivery: 2 },
      });
    });

    test('rejects an out-of-range rating filter with 400', async () => {
      asRole('admin');

      const res = await request(app).get('/api/reviews?rating=9').set(auth(adminToken()));

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/reviews (app rating without a dish)', () => {
    test('stores the rating with its aspect scores as pending approval', async () => {
      Review.findOne.mockImplementation(() => query(null));
      Review.create.mockImplementation((doc) => Promise.resolve(reviewDoc({ ...doc })));

      const res = await request(app)
        .post('/api/reviews')
        .set(auth(userToken()))
        .send({ rating: 5, comment: 'Loved the app', aspects: { food: 5, delivery: 4, support: 3 } });

      expect(res.status).toBe(201);
      expect(FoodItem.findById).not.toHaveBeenCalled();
      expect(Review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          foodItemId: null,
          rating: 5,
          isApproved: false,
          aspects: { food: 5, delivery: 4, support: 3 },
        })
      );
      expect(res.body.data.isApproved).toBe(false);
    });

    test('rejects an aspect score outside 1-5 with 400', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .set(auth(userToken()))
        .send({ rating: 5, aspects: { food: 6 } });

      expect(res.status).toBe(400);
      expect(Review.create).not.toHaveBeenCalled();
    });

    test('a new dish review also starts as pending', async () => {
      FoodItem.findById.mockImplementation(() => query({ _id: DISH_ID, categoryId: CATEGORY }));
      Review.findOne.mockImplementation(() => query(null));
      Review.create.mockImplementation((doc) => Promise.resolve(reviewDoc({ ...doc })));

      const res = await request(app)
        .post('/api/reviews')
        .set(auth(userToken()))
        .send({ foodItemId: DISH_ID, rating: 5 });

      expect(res.status).toBe(201);
      expect(res.body.data.isApproved).toBe(false);
    });
  });

  describe('PATCH /api/reviews/:id/approve', () => {
    test('requires an admin', async () => {
      const res = await request(app).patch(`/api/reviews/${REVIEW_ID}/approve`).set(auth(userToken()));
      expect(res.status).toBe(403);
    });

    test('approves a pending review', async () => {
      asRole('admin');
      const review = reviewDoc({ isApproved: false });
      Review.findById.mockImplementation(() => query(review));

      const res = await request(app).patch(`/api/reviews/${REVIEW_ID}/approve`).set(auth(adminToken()));

      expect(res.status).toBe(200);
      expect(review.isApproved).toBe(true);
      expect(review.save).toHaveBeenCalled();
      expect(res.body.message).toBe('Review approved — now visible in the app');
    });

    test('un-approves an approved review', async () => {
      asRole('admin');
      const review = reviewDoc({ isApproved: true });
      Review.findById.mockImplementation(() => query(review));

      const res = await request(app).patch(`/api/reviews/${REVIEW_ID}/approve`).set(auth(adminToken()));

      expect(res.status).toBe(200);
      expect(review.isApproved).toBe(false);
      expect(res.body.message).toBe('Review un-approved — hidden from the app');
    });

    test('returns 404 for an unknown review', async () => {
      asRole('admin');
      Review.findById.mockImplementation(() => query(null));

      const res = await request(app).patch(`/api/reviews/${REVIEW_ID}/approve`).set(auth(adminToken()));

      expect(res.status).toBe(404);
    });
  });
});
