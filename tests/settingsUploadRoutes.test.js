// D6. Settings (/api/settings) and Upload (/api/upload).
//
// Both route files declare no authentication/authorisation middleware even
// though settingsController documents the write as `@access Admin`.
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
import { uploadToCloudinary } from '../Config/cloudinary.js';
import {
  User,
  Settings,
  query,
  userDoc,
  signToken,
  validationError,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const settingsDoc = (over = {}) => ({
  _id: 'settings-1',
  storeName: 'FOOD KITCHEN',
  isOpen: true,
  deliveryFee: 99,
  minOrderAmount: 400,
  announcement: 'Fresh & hot',
  estimatedDeliveryTime: '30-45 mins',
  ...over,
});

const asAdmin = () => User.findById.mockImplementation(() => query(userDoc({ _id: 'admin-1', id: 'admin-1', role: 'admin' })));
const adminAuth = () => ({ Authorization: `Bearer ${signToken({ id: 'admin-1', role: 'admin' })}` });

beforeEach(() => {
  resetModelMocks();
  asAdmin();
  uploadToCloudinary.mockResolvedValue({ secure_url: 'http://mock.local/img.png', public_id: 'mock-public-id' });
});

describe('D6a. Settings (/api/settings)', () => {
  test('READ: GET /api/settings -> 200 with data', async () => {
    Settings.findOne.mockImplementation(() => query(settingsDoc()));

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deliveryFee).toBe(99);
  });

  test('READ: GET /api/settings creates defaults when none exist', async () => {
    Settings.findOne.mockImplementation(() => query(null));
    Settings.create.mockImplementation((doc) => Promise.resolve(settingsDoc(doc)));

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(Settings.create).toHaveBeenCalledTimes(1);
    expect(res.body.data.storeName).toBe('FOOD KITCHEN');
  });

  test('UPDATE: PUT /api/settings -> 200', async () => {
    Settings.findOneAndUpdate.mockImplementation(() => query(settingsDoc({ deliveryFee: 150 })));

    const res = await request(app).put('/api/settings').set(adminAuth()).send({ deliveryFee: 150, isOpen: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Settings updated successfully');
    expect(res.body.data.deliveryFee).toBe(150);
  });

  test('SECURITY: PUT /api/settings requires authentication', async () => {
    Settings.findOneAndUpdate.mockImplementation(() => query(settingsDoc({ deliveryFee: 1 })));

    const res = await request(app).put('/api/settings').send({ deliveryFee: 1 }); // no Authorization header

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(Settings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('SECURITY: PUT /api/settings rejects a non-admin token with 403', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));
    Settings.findOneAndUpdate.mockImplementation(() => query(settingsDoc({ deliveryFee: 1 })));

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${signToken({ id: 'user-1', role: 'user' })}`)
      .send({ deliveryFee: 1 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(Settings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('VALIDATION: a negative deliveryFee is rejected with 400 before any DB write', async () => {
    const res = await request(app).put('/api/settings').set(adminAuth()).send({ deliveryFee: -5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Delivery fee must be a non-negative number');
    expect(Settings.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('SECURITY: settings error responses never expose internal driver details', async () => {
    Settings.findOne.mockRejectedValue(
      new Error('E11000 duplicate key error collection: homefoods.settings index: _id_')
    );

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeUndefined(); // internal detail must not be echoed to clients
    expect(res.body.message).toBe('Failed to fetch settings');
    expect(JSON.stringify(res.body)).not.toMatch(/E11000/);
    expect(res.body.stack).toBeUndefined();
  });
});

describe('D6b. Upload (/api/upload)', () => {
  test('no file -> 400', async () => {
    const res = await request(app).post('/api/upload').set(adminAuth());

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/No image file uploaded/);
  });

  test('image file -> 200 with imageUrl and publicId', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set(adminAuth())
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imageUrl).toBe('http://mock.local/img.png');
    expect(res.body.publicId).toBe('mock-public-id');
    expect(uploadToCloudinary).toHaveBeenCalledTimes(1);
  });

  test('VALIDATION: a non-image file is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set(adminAuth())
      .attach('image', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Only image files/);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  test('SECURITY: POST /api/upload requires authentication', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'a.png', contentType: 'image/png' }); // no auth

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  test('SECURITY: POST /api/upload rejects a non-admin token with 403', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${signToken({ id: 'user-1', role: 'user' })}`)
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });
});
