// A. App-level behaviour: health check, 404 handler, malformed JSON.
//
// app.js has import-time side effects: it calls connectDB() and
// seedDatabaseIfEmpty() and loads dotenv. Everything that could touch the
// network / a database is mocked below, so importing the app never connects.
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
import mongoose from 'mongoose';
import app from '../app.js';
import connectDB from '../Config/db.js';
import { seedDatabaseIfEmpty } from '../Config/seeder.js';
import { resetModelMocks } from './helpers/modelMocks.cjs';

beforeEach(() => {
  resetModelMocks();
});

describe('A. App-level behaviour', () => {
  test('HARNESS GUARD: importing the app uses the mocked DB connector and never connects', async () => {
    expect(jest.isMockFunction(connectDB)).toBe(true);
    expect(jest.isMockFunction(seedDatabaseIfEmpty)).toBe(true);
    await connectDB(); // the mock resolves immediately - no network, no mongoose.connect
    expect(mongoose.connection.readyState).toBe(0); // 0 = disconnected: no live DB was reached
  });

  test('GET / returns 200 with { success: true }', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe('string');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('unknown route returns 404 JSON with the exact message format', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Route not found: /api/definitely-not-a-route',
    });
  });

  test('unknown route message preserves the query string (req.originalUrl)', async () => {
    const res = await request(app).get('/api/nope?a=1&b=2');

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found: /api/nope?a=1&b=2');
  });

  test('POST with malformed JSON returns 400 (body-parser error reaches the global handler)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com"');

    // If this ever returns 500, the global error handler has stopped honouring
    // err.status from body-parser and it must be reported as a defect.
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('malformed-JSON error body contains no stack trace', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email"');

    expect(res.body.stack).toBeUndefined();
    expect(res.text).not.toMatch(/at\s+.*\.js:\d+:\d+/);
  });

  test('request body above the 100kb JSON limit is rejected with 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });
});
