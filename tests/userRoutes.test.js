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
jest.mock('../Models/Order.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').Order }));

import request from 'supertest';
import app from '../app.js';
import {
  User,
  Order,
  query,
  userDoc,
  signToken,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const adminAuth = () => ({ Authorization: `Bearer ${signToken({ id: 'admin-1', role: 'admin' })}` });
const userAuth = () => ({ Authorization: `Bearer ${signToken({ id: 'user-1', role: 'user' })}` });

beforeEach(() => {
  resetModelMocks();
  User.findById.mockImplementation((id) => {
    if (id === 'admin-1') return query(userDoc({ _id: 'admin-1', id: 'admin-1', role: 'admin' }));
    return query(userDoc({ _id: 'user-1', id: 'user-1', role: 'user' }));
  });
  User.find.mockImplementation(() => query([userDoc({ _id: 'cust-1', name: 'Customer 1', role: 'user' })]));
  Order.aggregate.mockResolvedValue([]);
});

describe('User CRM Routes Security (/api/users)', () => {
  test('SECURITY: GET /api/users rejects unauthenticated with 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('SECURITY: GET /api/users rejects regular user with 403', async () => {
    const res = await request(app).get('/api/users').set(userAuth());
    expect(res.status).toBe(403);
  });

  test('ALLOW: GET /api/users allows admin with 200', async () => {
    const res = await request(app).get('/api/users').set(adminAuth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('SECURITY: PATCH /api/users/:id/status rejects regular user with 403', async () => {
    const res = await request(app)
      .patch('/api/users/cust-1/status')
      .set(userAuth())
      .send({ status: 'Blocked' });
    expect(res.status).toBe(403);
  });

  test('SECURITY: DELETE /api/users/:id rejects regular user with 403', async () => {
    const res = await request(app)
      .delete('/api/users/cust-1')
      .set(userAuth());
    expect(res.status).toBe(403);
  });

  test('SECURITY: GET /api/users/:id rejects regular user with 403', async () => {
    const res = await request(app)
      .get('/api/users/cust-1')
      .set(userAuth());
    expect(res.status).toBe(403);
  });
});
