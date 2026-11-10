// E. Input validation, NoSQL-operator payloads, mass assignment, unbounded
// strings and response data-leak checks.
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
import { sendEmail } from '../Config/email.js';
import {
  User,
  Order,
  query,
  queryReject,
  userDoc,
  signToken,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const VALID_REGISTER = {
  name: 'Ali Khan',
  email: 'ali@example.com',
  phone: '03001234567',
  city: 'Lahore',
  password: 'secret123',
};

const PASSWORD_HASH = 'hashed-password-value'; // the fake hash carried by userDoc()

beforeEach(() => {
  resetModelMocks();
  sendEmail.mockResolvedValue({ success: true, messageId: 'mock-message-id' });
});

describe('E1. NoSQL / operator-style payloads', () => {
  test('VALIDATION: login with an operator object as email is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: 'anything' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide both email and password');
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('SECURITY: an operator payload is rejected without leaking JS internals', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: 'anything' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).not.toMatch(/is not a function|Cannot read propert/);
    expect(res.body.stack).toBeUndefined();
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('VALIDATION: register with an operator object as email is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, email: { $gt: '' } });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide a valid email address');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('VALIDATION: forgot-password with an operator object as email is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide your registered email address');
    expect(User.findOne).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('VALIDATION: an array as email is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ['a@b.com'], password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test('SQL-injection-looking literal is passed to the query as a plain string (no operator injection)', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR 1=1 --", password: 'secret123' });

    expect(res.status).toBe(401);
    const filter = User.findOne.mock.calls[0][0];
    expect(filter).toEqual({ email: "' or 1=1 --" }); // literal equality, not a Mongo operator object
    expect(typeof filter.email).toBe('string');
  });
});

describe('E2. Unexpected / extra fields (mass assignment)', () => {
  test('register ignores role/_id/isAdmin supplied by the client', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) => Promise.resolve({
      _id: 'new-user',
      ...doc,
      createdAt: new Date(),
      generateAuthToken: () => 'mock-jwt-token',
    }));

    const res = await request(app).post('/api/auth/register').send({
      ...VALID_REGISTER,
      role: 'admin',
      isAdmin: true,
      _id: 'attacker-chosen-id',
      totalSpent: 999999,
    });

    expect(res.status).toBe(201);
    const created = User.create.mock.calls[0][0];
    expect(created.role).toBeUndefined();
    expect(created.isAdmin).toBeUndefined();
    expect(created._id).toBeUndefined();
    expect(created.totalSpent).toBeUndefined();
  });

  test('createOrder ignores client-supplied userId/status', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'user-1', id: 'user-1' })));
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve({
      ...doc,
      placedAt: new Date(),
      toObject: () => ({ ...doc }),
      save: jest.fn(),
    }));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signToken({ id: 'user-1', role: 'user' })}`)
      .send({
        orderId: 'ORD-2002',
        customerName: 'Test User',
        customerPhone: '03001234567',
        address: '1 Test Street',
        items: [{ title: 'X', type: 'dish', quantity: 1, price: 100 }],
        subtotal: 100,
        deliveryFee: 99,
        packagingFee: 20,
        total: 219,
        paymentMethod: 'cod',
        userId: 'someone-else',
        status: 'Delivered',
        customerEmail: 'attacker@example.com',
      });

    expect(res.status).toBe(201);
    const created = Order.create.mock.calls[0][0];
    expect(created.userId).toBe('user-1');
    expect(created.status).toBe('Processing');
  });
});

describe('E3. Unbounded input', () => {
  // The name/city/address fields are now bounded, so an over-long payload is a
  // clean 400 instead of being persisted.
  test('VALIDATION (Medium): a 30,000-character name is rejected with 400', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) => Promise.resolve({
      _id: 'new-user',
      ...doc,
      createdAt: new Date(),
      generateAuthToken: () => 'mock-jwt-token',
    }));

    const name = 'A'.repeat(30000);
    const city = 'C'.repeat(30000);

    const res = await request(app).post('/api/auth/register').send({ ...VALID_REGISTER, name, city });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Name must be 120 characters or fewer');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('VALIDATION (Medium): an over-long city is rejected with 400', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, city: 'C'.repeat(30000) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('City must be 60 characters or fewer');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('a special-character-heavy password is accepted by the registration rules', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) => Promise.resolve({
      _id: 'new-user',
      ...doc,
      createdAt: new Date(),
      generateAuthToken: () => 'mock-jwt-token',
    }));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, password: "'; DROP TABLE users; -- <script>" });

    expect(res.status).toBe(201);
  });
});

describe('E4. Data-leak checks', () => {
  test('no endpoint returns the stored password hash', async () => {
    // login
    const user = userDoc({ role: 'user', matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findOne.mockImplementation(() => query(user));
    const login = await request(app).post('/api/auth/login').send({ email: 'test.user@example.com', password: 'secret123' });
    expect(login.status).toBe(200);
    expect(login.text).not.toContain(PASSWORD_HASH);
    expect(login.body.user.password).toBeUndefined();

    // /me
    User.findById.mockImplementation(() => query(user));
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken({ id: 'u1', role: 'user' })}`);
    expect(me.status).toBe(200);
    expect(me.text).not.toContain(PASSWORD_HASH);
    expect(me.body.user.password).toBeUndefined();

    // reset-password
    user.resetPasswordOtp = '135790';
    user.resetPasswordExpire = new Date(Date.now() + 600000);
    User.findOne.mockImplementation(() => query(user));
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: user.email, otp: '135790', newPassword: 'brandnew1' });
    expect(reset.status).toBe(200);
    expect(reset.text).not.toContain(PASSWORD_HASH);
    expect(reset.body.user.password).toBeUndefined();
  });

  test('500 responses never contain a stack trace', async () => {
    User.findOne.mockImplementation(() => queryReject(new Error('boom')));

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'secret123' });

    expect(res.status).toBe(500);
    expect(res.body.stack).toBeUndefined();
    expect(res.text).not.toMatch(/at\s+\w+\s+\(.*:\d+:\d+\)/);
  });

  test('SECURITY: 500 responses never echo raw JavaScript or driver error messages', async () => {
    User.findOne.mockImplementation(() => queryReject(
      new Error('E11000 duplicate key error collection: homefoods.users index: email_1')
    ));

    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'secret123' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Server error during login' });
    expect(JSON.stringify(res.body)).not.toMatch(/E11000|is not a function|Cannot read propert/);
    expect(res.body.stack).toBeUndefined();
  });
});
