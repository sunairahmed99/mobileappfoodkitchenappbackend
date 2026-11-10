// E. Voucher CRUD (/api/vouchers) — the admin-managed discount codes that the
// storefront and the cart coupon box read from the database.
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
jest.mock('../Models/Voucher.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Voucher }));

import request from 'supertest';
import app from '../app.js';
import { User, Voucher, query, userDoc, signToken, castError, resetModelMocks } from './helpers/modelMocks.cjs';

const VALID_ID = '507f1f77bcf86cd799439011';
const MALFORMED_ID = 'not-a-valid-objectid';

const adminToken = () => signToken({ id: 'admin-1', role: 'admin' });
const userToken = () => signToken({ id: 'user-1', role: 'user' });
const adminAuth = () => ({ Authorization: `Bearer ${adminToken()}` });
const userAuth = () => ({ Authorization: `Bearer ${userToken()}` });

const voucherDoc = (over = {}) => ({
  _id: VALID_ID,
  code: 'SAVE100',
  discountType: 'fixed',
  discountValue: 100,
  minOrder: 600,
  expiryDate: '31 Dec 2026',
  isActive: true,
  save: jest.fn(function save() { return Promise.resolve(this); }),
  ...over,
});

beforeEach(() => {
  resetModelMocks();
  User.findById.mockImplementation(() => query(userDoc({ role: 'admin' })));
});

describe('E. Vouchers (/api/vouchers)', () => {
  test('READ all: GET /api/vouchers is public -> 200 with the stored vouchers', async () => {
    Voucher.find.mockImplementation(() => query([voucherDoc(), voucherDoc({ _id: 'voucher-2', code: 'FEAST20' })]));

    const res = await request(app).get('/api/vouchers');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    expect(res.body.vouchers).toHaveLength(2);
  });

  test('READ all: ?active=true only returns active vouchers', async () => {
    Voucher.find.mockImplementation(() => query([]));

    const res = await request(app).get('/api/vouchers?active=true');

    expect(res.status).toBe(200);
    expect(Voucher.find).toHaveBeenCalledWith({ isActive: true });
  });

  test('READ one: GET /api/vouchers/:id -> 200', async () => {
    Voucher.findById.mockImplementation(() => query(voucherDoc()));

    const res = await request(app).get(`/api/vouchers/${VALID_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.voucher.code).toBe('SAVE100');
  });

  test('READ one: unknown id -> 404', async () => {
    Voucher.findById.mockImplementation(() => query(null));

    const res = await request(app).get(`/api/vouchers/${VALID_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Voucher not found' });
  });

  test('ERROR MAPPING: malformed id is mapped to 400', async () => {
    Voucher.findById.mockRejectedValue(castError('_id', MALFORMED_ID));

    const res = await request(app).get(`/api/vouchers/${MALFORMED_ID}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid id format' });
  });

  test('CREATE: POST /api/vouchers as admin -> 201 with an upper-cased code', async () => {
    Voucher.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app)
      .post('/api/vouchers')
      .set(adminAuth())
      .send({ code: ' save100 ', discountType: 'percentage', discountValue: '25', minOrder: '900', expiryDate: '31 Dec 2026' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Voucher created successfully');
    expect(res.body.voucher.code).toBe('SAVE100');
    expect(Voucher.create).toHaveBeenCalledWith({
      code: 'SAVE100',
      discountType: 'percentage',
      discountValue: 25,
      minOrder: 900,
      expiryDate: '31 Dec 2026',
      isActive: true,
    });
  });

  test('CREATE: missing code -> 400 and nothing is written', async () => {
    const res = await request(app).post('/api/vouchers').set(adminAuth()).send({ discountValue: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Voucher code is required');
    expect(Voucher.create).not.toHaveBeenCalled();
  });

  test('CREATE: missing discount value -> 400', async () => {
    const res = await request(app).post('/api/vouchers').set(adminAuth()).send({ code: 'SAVE100' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Discount value is required');
    expect(Voucher.create).not.toHaveBeenCalled();
  });

  test('CREATE: duplicate code -> 409', async () => {
    Voucher.findOne.mockImplementation(() => query(voucherDoc()));

    const res = await request(app).post('/api/vouchers').set(adminAuth()).send({ code: 'save100', discountValue: 100 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(Voucher.create).not.toHaveBeenCalled();
  });

  test('CREATE: an empty DB means no duplicate, so the first voucher is saved', async () => {
    Voucher.create.mockImplementation((doc) => Promise.resolve({ _id: VALID_ID, ...doc }));

    const res = await request(app).post('/api/vouchers').set(adminAuth()).send({ code: 'FIRST50', discountValue: 50 });

    expect(res.status).toBe(201);
    expect(Voucher.findOne).toHaveBeenCalledWith({ code: 'FIRST50' });
  });

  test('UPDATE: PUT /api/vouchers/:id as admin persists the new values -> 200', async () => {
    const doc = voucherDoc();
    Voucher.findById.mockImplementation(() => query(doc));

    const res = await request(app)
      .put(`/api/vouchers/${VALID_ID}`)
      .set(adminAuth())
      .send({ discountValue: '250', minOrder: '1200', isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Voucher updated successfully');
    expect(doc.discountValue).toBe(250);
    expect(doc.minOrder).toBe(1200);
    expect(doc.isActive).toBe(false);
    expect(doc.save).toHaveBeenCalledTimes(1);
  });

  test('UPDATE: renaming onto an existing code -> 409', async () => {
    const doc = voucherDoc({ code: 'SAVE100' });
    Voucher.findById.mockImplementation(() => query(doc));
    Voucher.findOne.mockImplementation(() => query(voucherDoc({ code: 'TAKEN' })));

    const res = await request(app).put(`/api/vouchers/${VALID_ID}`).set(adminAuth()).send({ code: 'TAKEN' });

    expect(res.status).toBe(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('UPDATE: unknown id -> 404', async () => {
    Voucher.findById.mockImplementation(() => query(null));

    const res = await request(app).put(`/api/vouchers/${VALID_ID}`).set(adminAuth()).send({ discountValue: 10 });

    expect(res.status).toBe(404);
  });

  test('TOGGLE: PATCH /api/vouchers/:id/status flips isActive -> 200', async () => {
    const doc = voucherDoc({ isActive: true });
    Voucher.findById.mockImplementation(() => query(doc));

    const res = await request(app).patch(`/api/vouchers/${VALID_ID}/status`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(doc.isActive).toBe(false);
    expect(res.body.message).toBe('Voucher is now inactive');
  });

  test('DELETE: DELETE /api/vouchers/:id as admin -> 200', async () => {
    Voucher.findById.mockImplementation(() => query(voucherDoc()));

    const res = await request(app).delete(`/api/vouchers/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Voucher deleted successfully' });
    expect(Voucher.findByIdAndDelete).toHaveBeenCalledWith(VALID_ID);
  });

  test('DELETE: unknown id -> 404 and nothing is removed', async () => {
    Voucher.findById.mockImplementation(() => query(null));

    const res = await request(app).delete(`/api/vouchers/${VALID_ID}`).set(adminAuth());

    expect(res.status).toBe(404);
    expect(Voucher.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('SECURITY: creating a voucher requires authentication', async () => {
    const res = await request(app).post('/api/vouchers').send({ code: 'SAVE100', discountValue: 100 });

    expect(res.status).toBe(401);
    expect(Voucher.create).not.toHaveBeenCalled();
  });

  test('SECURITY: a non-admin cannot create a voucher', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));

    const res = await request(app).post('/api/vouchers').set(userAuth()).send({ code: 'SAVE100', discountValue: 100 });

    expect(res.status).toBe(403);
    expect(Voucher.create).not.toHaveBeenCalled();
  });

  test('SECURITY: a non-admin cannot delete a voucher', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));
    Voucher.findById.mockImplementation(() => query(voucherDoc()));

    const res = await request(app).delete(`/api/vouchers/${VALID_ID}`).set(userAuth());

    expect(res.status).toBe(403);
    expect(Voucher.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
