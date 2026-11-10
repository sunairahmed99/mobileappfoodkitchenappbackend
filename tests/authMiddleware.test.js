// B. auth middleware (Middlewares/auth.js): authentication + role authorisation.
//
// The middleware is exercised through real routes (GET /api/auth/me and the
// admin-only GET /api/orders) with the User model and all I/O mocked.
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
import jwt from 'jsonwebtoken';
import app from '../app.js';
import {
  User,
  Order,
  query,
  userDoc,
  signToken,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const WRONG_SECRET = 'a-totally-different-secret';

beforeEach(() => {
  resetModelMocks();
});

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

describe('B. auth middleware', () => {
  test('missing Authorization header -> 401 with the exact message', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: 'Not authorized, no authorization token provided.',
    });
  });

  test('"Bearer" with no token -> 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Not authorized, token invalid or expired.');
  });

  test('"Bearer " (empty token) -> 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('non-Bearer scheme (e.g. "Token abc") -> 401 no-token message', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Token abc.def.ghi');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorized, no authorization token provided.');
  });

  test('token signed with the wrong secret -> 401', async () => {
    const token = jwt.sign({ id: 'u1', role: 'user' }, WRONG_SECRET, { expiresIn: '1h' });
    const res = await request(app).get('/api/auth/me').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorized, token invalid or expired.');
  });

  test('tampered token signature -> 401', async () => {
    const valid = signToken({ id: 'u1', role: 'user' }, { expiresIn: '1h' });
    const tampered = `${valid.slice(0, -3)}${valid.slice(-3) === 'aaa' ? 'bbb' : 'aaa'}`;
    const res = await request(app).get('/api/auth/me').set(authHeader(tampered));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorized, token invalid or expired.');
  });

  test('structurally invalid token -> 401', async () => {
    const res = await request(app).get('/api/auth/me').set(authHeader('not.a.jwt'));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('expired token (signed with expiresIn: -10s) -> 401', async () => {
    const expired = signToken({ id: 'u1', role: 'user' }, { expiresIn: '-10s' });
    const res = await request(app).get('/api/auth/me').set(authHeader(expired));

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorized, token invalid or expired.');
  });

  test('valid token but the user no longer exists (User.findById -> null) -> 401', async () => {
    User.findById.mockImplementation(() => query(null));
    const token = signToken({ id: 'deleted-user', role: 'user' }, { expiresIn: '1h' });

    const res = await request(app).get('/api/auth/me').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      message: 'User belonging to this token no longer exists.',
    });
  });

  test('valid token + existing user -> 200 and the response omits the password', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));
    const token = signToken({ id: 'u1', role: 'user' }, { expiresIn: '1h' });

    const res = await request(app).get('/api/auth/me').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('test.user@example.com');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.matchPassword).toBeUndefined();
  });

  test('role "user" hitting an admin-only route -> 403', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));
    const token = signToken({ id: 'u1', role: 'user' }, { expiresIn: '1h' });

    const res = await request(app).get('/api/orders').set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: "User role 'user' is not authorized to access this resource.",
    });
    expect(Order.find).not.toHaveBeenCalled();
  });

  test('role "admin" is allowed on the admin-only route -> 200', async () => {
    User.findById.mockImplementation(() => query(userDoc({ role: 'admin' })));
    Order.find.mockImplementation(() => query([]));
    const token = signToken({ id: 'a1', role: 'admin' }, { expiresIn: '1h' });

    const res = await request(app).get('/api/orders').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, orders: [] });
  });

  test('role elevated in the token payload alone is not enough (DB role wins)', async () => {
    // The token says admin but the stored user is a regular user.
    User.findById.mockImplementation(() => query(userDoc({ role: 'user' })));
    const token = signToken({ id: 'u1', role: 'admin' }, { expiresIn: '1h' });

    const res = await request(app).get('/api/orders').set(authHeader(token));

    expect(res.status).toBe(403);
    expect(Order.find).not.toHaveBeenCalled();
  });
});
