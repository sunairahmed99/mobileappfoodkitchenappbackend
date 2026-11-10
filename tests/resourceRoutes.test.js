// D. Resource CRUD for banners, categories, deals and food items, plus the
// access-control checks (parent brief D + parent addition 2).
//
// NOTE: Routes/bannerRoutes.js, categoryRoutes.js, dealRoutes.js and
// foodItemRoutes.js declare no `protect` / `authorize` middleware at all, even
// though the controllers document those writes as `@access Admin`. The tests
// below assert the intended 401/403 and therefore FAIL, documenting the defect.
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
  sendEmail: jest.fn(() => Promise.resolve({ success: true, messageId: 'mock-message-id' })),
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
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import {
  User,
  Banner,
  Category,
  Deal,
  FoodItem,
  query,
  queryReject,
  userDoc,
  signToken,
  castError,
  validationError,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const VALID_ID = '507f1f77bcf86cd799439011';
const MALFORMED_ID = 'not-a-valid-objectid';

const userToken = () => signToken({ id: 'user-1', role: 'user' });
const adminToken = () => signToken({ id: 'admin-1', role: 'admin' });
const asRole = (role) => User.findById.mockImplementation(() => query(userDoc({ role })));
const asAdmin = () => asRole('admin');
const asUser = () => asRole('user');
const adminAuth = () => ({ Authorization: `Bearer ${adminToken()}` });

beforeEach(() => {
  resetModelMocks();
  asAdmin();
  uploadToCloudinary.mockResolvedValue({ secure_url: 'http://mock.local/img.png', public_id: 'mock-public-id' });
  deleteFromCloudinary.mockResolvedValue({ result: 'ok' });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D1. Banners (/api/banners)', () => {
  const validBody = { title: 'Summer Sale', imageUrl: 'http://img.local/banner.jpg' };

  test('CREATE: POST /api/banners -> 201', async () => {
    Banner.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/banners').set(adminAuth()).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Banner created successfully');
    expect(res.body.banner.title).toBe('Summer Sale');
    expect(Banner.create).toHaveBeenCalledTimes(1);
  });

  test('CREATE without any image -> 400 and the model is never touched', async () => {
    const res = await request(app).post('/api/banners').set(adminAuth()).send({ title: 'No image' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Banner.create).not.toHaveBeenCalled();
  });

  test('READ list: GET /api/banners -> 200 with count', async () => {
    Banner.find.mockImplementation(() => query([{ _id: VALID_ID, title: 'A' }, { _id: 'b2', title: 'B' }]));

    const res = await request(app).get('/api/banners');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.banners).toHaveLength(2);
  });

  test('READ one: GET /api/banners/:id -> 200', async () => {
    Banner.findById.mockImplementation(() => query({ _id: VALID_ID, title: 'A' }));

    const res = await request(app).get(`/api/banners/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.banner._id).toBe(VALID_ID);
  });

  test('READ one: non-existent id -> 404', async () => {
    Banner.findById.mockImplementation(() => query(null));

    const res = await request(app).get(`/api/banners/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Banner not found' });
  });

  test('ERROR MAPPING: malformed ObjectId is mapped to 400 "Invalid id format"', async () => {
    Banner.findById.mockRejectedValue(castError('_id', MALFORMED_ID));

    const res = await request(app).get(`/api/banners/${MALFORMED_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid id format' });
    expect(res.body.stack).toBeUndefined();
  });

  test('UPDATE: PUT /api/banners/:id -> 200', async () => {
    const doc = { _id: VALID_ID, title: 'Old', imageUrl: 'http://img/old.jpg', cloudinaryId: null, save: jest.fn() };
    doc.save.mockImplementation(function save() { return Promise.resolve({ ...this, title: this.title }); });
    Banner.findById.mockImplementation(() => query(doc));

    const res = await request(app).put(`/api/banners/${VALID_ID}`).set(adminAuth()).send({ title: 'New' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Banner updated successfully');
    expect(doc.title).toBe('New');
  });

  test('DELETE: DELETE /api/banners/:id -> 200', async () => {
    Banner.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null }));
    Banner.findByIdAndDelete.mockResolvedValue({});

    const res = await request(app).delete(`/api/banners/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Banner deleted successfully' });
  });

  test('DELETE non-existent -> 404', async () => {
    Banner.findById.mockImplementation(() => query(null));

    const res = await request(app).delete(`/api/banners/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(404);
  });

  test('SECURITY: POST /api/banners requires authentication', async () => {
    Banner.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/banners').send(validBody); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(Banner.create).not.toHaveBeenCalled();
  });

  test('SECURITY: DELETE /api/banners/:id requires authentication', async () => {
    Banner.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null }));
    Banner.findByIdAndDelete.mockResolvedValue({});

    const res = await request(app).delete(`/api/banners/${VALID_ID}`); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(Banner.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('SECURITY: DELETE /api/banners/:id rejects a non-admin token with 403', async () => {
    asUser();
    Banner.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null }));
    Banner.findByIdAndDelete.mockResolvedValue({});

    const res = await request(app).delete(`/api/banners/${VALID_ID}`).set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(Banner.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D2. Categories (/api/categories)', () => {
  const validBody = { name: 'Biryani', imageUrl: 'http://img.local/cat.jpg' };

  test('CREATE: POST /api/categories -> 201', async () => {
    Category.findOne.mockImplementation(() => query(null));
    Category.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/categories').set(adminAuth()).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.category.name).toBe('Biryani');
  });

  test('CREATE without a name -> 400', async () => {
    const res = await request(app).post('/api/categories').set(adminAuth()).send({ imageUrl: 'http://img/x.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Category name is required');
  });

  test('CREATE without an image -> 400', async () => {
    Category.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/categories').set(adminAuth()).send({ name: 'Biryani' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Category image is required/);
  });

  test('CREATE duplicate name -> 400', async () => {
    Category.findOne.mockImplementation(() => query({ _id: 'other', name: 'Biryani' }));

    const res = await request(app).post('/api/categories').set(adminAuth()).send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A category with this name already exists');
    expect(Category.create).not.toHaveBeenCalled();
  });

  test('READ list -> 200 with count', async () => {
    Category.find.mockImplementation(() => query([{ _id: 'c1' }]));

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('READ one non-existent -> 404', async () => {
    Category.findById.mockImplementation(() => query(null));

    const res = await request(app).get(`/api/categories/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Category not found');
  });

  test('ERROR MAPPING: malformed ObjectId is mapped to 400 "Invalid id format"', async () => {
    Category.findById.mockRejectedValue(castError('_id', MALFORMED_ID));

    const res = await request(app).get(`/api/categories/${MALFORMED_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid id format' });
    expect(res.body.stack).toBeUndefined();
  });

  test('UPDATE: PUT /api/categories/:id -> 200', async () => {
    const doc = { _id: VALID_ID, name: 'Old', cloudinaryId: null, save: jest.fn() };
    doc.save.mockImplementation(function save() { return Promise.resolve(this); });
    Category.findById.mockImplementation(() => query(doc));

    const res = await request(app).put(`/api/categories/${VALID_ID}`).set(adminAuth()).send({ itemCount: 5 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Category updated successfully');
  });

  test('DELETE: DELETE /api/categories/:id -> 200', async () => {
    Category.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null }));
    Category.findByIdAndDelete.mockResolvedValue({});

    const res = await request(app).delete(`/api/categories/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Category deleted successfully' });
  });

  test('SECURITY: POST /api/categories requires authentication', async () => {
    Category.findOne.mockImplementation(() => query(null));
    Category.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/categories').send(validBody); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(Category.create).not.toHaveBeenCalled();
  });

  test('SECURITY: POST /api/categories rejects a non-admin token with 403', async () => {
    asUser();
    Category.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(Category.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D3. Deals (/api/deals)', () => {
  const validBody = { dealTitle: 'Family Combo', dealPrice: 1499, originalPrice: 1999, imageUrl: 'http://img.local/deal.jpg' };

  test('CREATE: POST /api/deals -> 201', async () => {
    Deal.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/deals').set(adminAuth()).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.deal.dealTitle).toBe('Family Combo');
  });

  test('CREATE without a title -> 400', async () => {
    const res = await request(app).post('/api/deals').set(adminAuth()).send({ ...validBody, dealTitle: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Deal title is required');
  });

  test('CREATE with a non-numeric price -> 400', async () => {
    const res = await request(app).post('/api/deals').set(adminAuth()).send({ ...validBody, dealPrice: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Valid deal price is required');
  });

  test('CREATE without an image -> 400', async () => {
    const res = await request(app).post('/api/deals').set(adminAuth()).send({ dealTitle: 'X', dealPrice: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Deal image is required/);
  });

  test('VALIDATION: a negative dealPrice is rejected with 400 before any DB write', async () => {
    const res = await request(app)
      .post('/api/deals')
      .set(adminAuth())
      .send({ ...validBody, dealPrice: -500, originalPrice: -1000 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Deal prices cannot be negative');
    expect(Deal.create).not.toHaveBeenCalled();
  });

  test('CREATE with a zero price is accepted -> 201', async () => {
    Deal.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/deals').set(adminAuth()).send({ ...validBody, dealPrice: 0 });

    expect(res.status).toBe(201);
    expect(Deal.create.mock.calls[0][0].dealPrice).toBe(0);
  });

  test('READ list -> 200 with count', async () => {
    Deal.find.mockImplementation(() => query([{ _id: 'd1' }]));

    const res = await request(app).get('/api/deals');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('READ one non-existent -> 404', async () => {
    Deal.findById.mockImplementation(() => query(null));

    const res = await request(app).get(`/api/deals/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Deal not found');
  });

  test('ERROR MAPPING: malformed ObjectId is mapped to 400 "Invalid id format"', async () => {
    Deal.findById.mockRejectedValue(castError('_id', MALFORMED_ID));

    const res = await request(app).get(`/api/deals/${MALFORMED_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid id format' });
  });

  test('UPDATE: PUT /api/deals/:id -> 200', async () => {
    Deal.findById.mockImplementation(() => query({ _id: VALID_ID, dealPrice: 100, originalPrice: 200, cloudinaryId: null }));
    Deal.findByIdAndUpdate.mockImplementation(() => query({ _id: VALID_ID, dealPrice: 150 }));

    const res = await request(app).put(`/api/deals/${VALID_ID}`).set(adminAuth()).send({ dealPrice: 150 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deal updated successfully');
  });

  test('DELETE: DELETE /api/deals/:id -> 200', async () => {
    Deal.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null }));
    Deal.findByIdAndDelete.mockResolvedValue({});

    const res = await request(app).delete(`/api/deals/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Deal deleted successfully' });
  });

  test('SECURITY: POST /api/deals requires authentication', async () => {
    Deal.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/deals').send(validBody); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(Deal.create).not.toHaveBeenCalled();
  });

  test('SECURITY: POST /api/deals rejects a non-admin token with 403', async () => {
    asUser();
    Deal.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(Deal.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D4. Food items (/api/food-items)', () => {
  const validBody = { name: 'Chicken Biryani', categoryId: VALID_ID, price: 450 };

  test('CREATE: POST /api/food-items -> 201', async () => {
    FoodItem.create.mockImplementation((doc) => Promise.resolve({
      _id: 'f1',
      ...doc,
      populate: jest.fn(() => Promise.resolve({ _id: 'f1', ...doc, categoryId: { name: 'Biryani' } })),
    }));

    const res = await request(app).post('/api/food-items').set(adminAuth()).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Chicken Biryani');
  });

  test('CREATE without a name -> 400', async () => {
    const res = await request(app).post('/api/food-items').set(adminAuth()).send({ ...validBody, name: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Food item name is required');
  });

  test('CREATE without a categoryId -> 400', async () => {
    const res = await request(app).post('/api/food-items').set(adminAuth()).send({ name: 'X', price: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Category is required');
  });

  test('CREATE without a price -> 400', async () => {
    const res = await request(app).post('/api/food-items').set(adminAuth()).send({ name: 'X', categoryId: VALID_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Price is required');
  });

  test('VALIDATION: a negative price is rejected with 400 before any DB write', async () => {
    const res = await request(app).post('/api/food-items').set(adminAuth()).send({ ...validBody, price: -5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Prices cannot be negative');
    expect(FoodItem.create).not.toHaveBeenCalled();
  });

  test('READ list -> 200 with count', async () => {
    FoodItem.find.mockImplementation(() => query([{ _id: 'f1' }]));

    const res = await request(app).get('/api/food-items');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  test('READ one non-existent -> 404', async () => {
    FoodItem.findById.mockImplementation(() => query(null));

    const res = await request(app).get(`/api/food-items/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Food item not found');
  });

  test('ERROR MAPPING: malformed ObjectId is mapped to 400 "Invalid id format"', async () => {
    FoodItem.findById.mockImplementation(() => queryReject(castError('_id', MALFORMED_ID)));

    const res = await request(app).get(`/api/food-items/${MALFORMED_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid id format' });
  });

  test('UPDATE: PUT /api/food-items/:id -> 200', async () => {
    FoodItem.findById.mockImplementation(() => query({ _id: VALID_ID, name: 'Old', imageUrl: '', cloudinaryId: null, servingOptions: [] }));
    FoodItem.findByIdAndUpdate.mockImplementation(() => query({ _id: VALID_ID, name: 'New' }));

    const res = await request(app).put(`/api/food-items/${VALID_ID}`).set(adminAuth()).send({ name: 'New', price: 500 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Food item updated');
  });

  test('DELETE: DELETE /api/food-items/:id -> 200', async () => {
    FoodItem.findById.mockImplementation(() => query({ _id: VALID_ID, cloudinaryId: null, deleteOne: jest.fn(() => Promise.resolve({})) }));

    const res = await request(app).delete(`/api/food-items/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Food item deleted successfully' });
  });

  test('SECURITY: POST /api/food-items requires authentication', async () => {
    FoodItem.create.mockImplementation((doc) => Promise.resolve({ _id: 'f1', ...doc, populate: jest.fn(() => Promise.resolve(doc)) }));

    const res = await request(app).post('/api/food-items').send(validBody); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(FoodItem.create).not.toHaveBeenCalled();
  });

  test('SECURITY: POST /api/food-items rejects a non-admin token with 403', async () => {
    asUser();
    FoodItem.create.mockImplementation((doc) => Promise.resolve({ _id: 'f1', ...doc, populate: jest.fn(() => Promise.resolve(doc)) }));

    const res = await request(app)
      .post('/api/food-items')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(FoodItem.create).not.toHaveBeenCalled();
  });
});
