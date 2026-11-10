// D5. Orders (/api/orders) - the only resource group that IS protected.
// Also contains parent addition 3 (price tampering), 4 (duplicate orderId /
// cross-user leak path) and 6 (unexpected stored status -> 500).
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
  userDoc,
  signToken,
  duplicateKeyError,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const VALID_ORDER = {
  orderId: 'ORD-1001',
  customerName: 'Test User',
  customerPhone: '03001234567',
  address: '1 Test Street, Lahore',
  items: [{ productId: 'p1', title: 'Chicken Biryani', type: 'dish', serving: 'For 2 Persons', quantity: 2, price: 500, imageUrl: '' }],
  subtotal: 1000,
  discount: 0,
  deliveryFee: 99,
  packagingFee: 20,
  tip: 0,
  total: 1119,
  paymentMethod: 'cod',
  notes: 'Leave at the door',
};

function orderDoc(over = {}) {
  const base = {
    orderId: 'ORD-1001',
    userId: 'user-1',
    customerName: 'Test User',
    customerEmail: 'test.user@example.com',
    customerPhone: '03001234567',
    address: '1 Test Street, Lahore',
    items: VALID_ORDER.items,
    subtotal: 1000,
    discount: 0,
    deliveryFee: 99,
    packagingFee: 20,
    tip: 0,
    total: 1119,
    paymentMethod: 'cod',
    transactionId: '',
    notes: 'Leave at the door',
    status: 'Processing',
    placedAt: new Date('2024-05-01T10:00:00Z'),
    estimatedDeliveryTime: '30-45 mins',
    ...over,
  };
  base.save = jest.fn(function save() { return Promise.resolve(this); });
  base.toObject = () => ({ ...base, toObject: undefined, save: undefined });
  return base;
}

const userToken = () => signToken({ id: 'user-1', role: 'user' });
const adminToken = () => signToken({ id: 'admin-1', role: 'admin' });
const asUser = (id = 'user-1') => User.findById.mockImplementation(() => query(userDoc({ _id: id, id })));
const asAdmin = () => User.findById.mockImplementation(() => query(userDoc({ _id: 'admin-1', id: 'admin-1', role: 'admin' })));

beforeEach(() => {
  resetModelMocks();
  sendEmail.mockResolvedValue({ success: true, messageId: 'mock-message-id' });
});

describe('D5. Orders - access control', () => {
  test('POST /api/orders without a token -> 401', async () => {
    const res = await request(app).post('/api/orders').send(VALID_ORDER);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/orders (all orders) without a token -> 401', async () => {
    const res = await request(app).get('/api/orders');

    expect(res.status).toBe(401);
  });

  test('GET /api/orders with a non-admin token -> 403', async () => {
    asUser();

    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(403);
    expect(Order.find).not.toHaveBeenCalled();
  });

  test('PATCH /api/orders/:id/status with a non-admin token -> 403', async () => {
    asUser();

    const res = await request(app)
      .patch('/api/orders/ORD-1001/status')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ status: 'Confirmed' });

    expect(res.status).toBe(403);
  });

  test('GET /api/orders/mine with a token -> 200 (own orders only)', async () => {
    asUser();
    Order.find.mockImplementation(() => query([orderDoc()]));

    const res = await request(app).get('/api/orders/mine').set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orders).toHaveLength(1);
    expect(Order.find.mock.calls[0][0]).toEqual({ userId: 'user-1' });
  });
});

describe('D5. Orders - create', () => {
  test('valid order -> 201 with a serialized order and emailSent', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve(orderDoc(doc)));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(VALID_ORDER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.order.id).toBe('ORD-1001');
    expect(res.body.order.status).toBe('Processing');
    expect(Order.create.mock.calls[0][0].userId).toBe('user-1');
  });

  test('missing required fields -> 400', async () => {
    asUser();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ orderId: 'ORD-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order details are incomplete.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  test('empty items array -> 400', async () => {
    asUser();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, items: [] });

    expect(res.status).toBe(400);
  });

  test('item with an unknown type -> 400', async () => {
    asUser();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, items: [{ title: 'X', type: 'hacked', quantity: 1, price: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order contains invalid item or payment details.');
  });

  test('quantity of 0 -> 400', async () => {
    asUser();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, items: [{ title: 'X', type: 'dish', quantity: 0, price: 10 }] });

    expect(res.status).toBe(400);
  });

  test('negative total -> 400', async () => {
    asUser();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, total: -100 });

    expect(res.status).toBe(400);
  });

  // The server now recomputes/verifies every money field before persisting, so
  // a client cannot dictate the price of an order.
  test('VALIDATION (High): client-supplied totals are rejected when the item price is not positive', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve(orderDoc(doc)));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        ...VALID_ORDER,
        subtotal: 9999,
        total: 1,
        items: [{ productId: 'p1', title: 'Free food', type: 'dish', quantity: 1, price: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order contains invalid item or payment details.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  test('VALIDATION (High): a subtotal that does not match the line items is rejected', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve(orderDoc(doc)));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, subtotal: 1, total: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order subtotal does not match the sum of its items.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  test('VALIDATION (Medium): a discount larger than the subtotal is rejected', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve(orderDoc(doc)));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({
        ...VALID_ORDER,
        items: [{ title: 'X', type: 'dish', quantity: 1, price: 100 }],
        subtotal: 100,
        discount: 500,
        deliveryFee: 0,
        packagingFee: 0,
        tip: 0,
        total: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order discount cannot be greater than the subtotal.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  test('VALIDATION (Medium): a total that does not equal subtotal-discount+fees+tip is rejected', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));
    Order.create.mockImplementation((doc) => Promise.resolve(orderDoc(doc)));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ ...VALID_ORDER, subtotal: 1000, discount: 0, deliveryFee: 99, packagingFee: 20, tip: 0, total: 5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order total does not match subtotal minus discount plus fees and tip.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  test('same orderId for the SAME user is idempotent -> 200 "already been placed"', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc()));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(VALID_ORDER);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('This order has already been placed.');
    expect(Order.create).not.toHaveBeenCalled();
  });

  // Order.orderId is globally unique, so a second user reusing an id is a
  // conflict that must be reported as 409 (not a generic 500).
  test('CONFLICT: a second user reusing a taken orderId gets 409', async () => {
    asUser('user-b');
    Order.findOne.mockImplementation(() => query(null)); // scoped to user-b -> no match
    Order.create.mockRejectedValue(duplicateKeyError('ORD-1001'));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signToken({ id: 'user-b', role: 'user' })}`)
      .send(VALID_ORDER);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This order ID is already in use. Please refresh and try again.');
  });

  test('SECURITY: the "already placed" path never serialises another user\'s order', async () => {
    asUser('user-b');
    // A foreign document (normally impossible because the query is userId-scoped,
    // but the code now verifies ownership before returning anything).
    Order.findOne.mockImplementation(() => query(orderDoc({ userId: 'user-a', customerName: 'Victim User', customerPhone: '03999999999' })));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${signToken({ id: 'user-b', role: 'user' })}`)
      .send(VALID_ORDER);

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('Victim User');
    expect(JSON.stringify(res.body)).not.toContain('03999999999');
  });
});

describe('D5. Orders - status transitions', () => {
  test('admin: valid transition Processing -> Confirmed -> 200', async () => {
    asAdmin();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Processing' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'Confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.status).toBe('Confirmed');
  });

  test('admin: invalid transition Processing -> Delivered -> 400', async () => {
    asAdmin();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Processing' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'Delivered' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order cannot move from Processing to Delivered.');
  });

  test('admin: unknown orderId -> 404', async () => {
    asAdmin();
    Order.findOne.mockImplementation(() => query(null));

    const res = await request(app)
      .patch('/api/orders/NOPE/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'Confirmed' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Order not found.');
  });

  test('user cancels their own Processing order -> 200', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Processing' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/cancel')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.status).toBe('Cancelled');
  });

  test('user cannot cancel a Delivered order -> 400', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Delivered' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/cancel')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This order can no longer be cancelled.');
  });

  // allowedTransitions[order.status] is now null-safe, so a stored status
  // outside the enum is a 400 instead of an unhandled TypeError -> 500.
  test('ERROR MAPPING: an unexpected stored status makes updateOrderStatus return 400', async () => {
    asAdmin();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Unknown' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'Confirmed' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Order cannot move from Unknown to Confirmed.');
    expect(res.body.stack).toBeUndefined();
  });

  test('ERROR MAPPING: an unexpected stored status makes cancelMyOrder return 400', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc({ status: 'Unknown' })));

    const res = await request(app)
      .patch('/api/orders/ORD-1001/cancel')
      .set('Authorization', `Bearer ${userToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This order can no longer be cancelled.');
  });
});

describe('D5. Orders - confirmation e-mail', () => {
  test('own order -> 200 and sendEmail is called', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc()));

    const res = await request(app)
      .post('/api/orders/confirmation-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ orderId: 'ORD-1001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Order confirmation email sent.' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('unknown order -> 404', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(null));

    const res = await request(app)
      .post('/api/orders/confirmation-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ orderId: 'NOPE' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Order not found.');
  });

  test('sendEmail failure -> 500', async () => {
    asUser();
    Order.findOne.mockImplementation(() => query(orderDoc()));
    sendEmail.mockRejectedValue(new Error('Email delivery failed: SMTP down'));

    const res = await request(app)
      .post('/api/orders/confirmation-email')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ orderId: 'ORD-1001' });

    expect(res.status).toBe(500);
  });
});
