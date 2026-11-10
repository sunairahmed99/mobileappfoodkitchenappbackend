'use strict';

/**
 * Shared in-memory stand-ins for the Mongoose models.
 *
 * Nothing here ever touches MongoDB - every model method is a jest mock.
 * The `query()` helper returns a "thenable query" that supports the small
 * subset of the Mongoose query API used by the controllers
 * (.select / .populate / .sort / .lean) while also being awaitable directly
 * (controllers sometimes do `await Model.findOne({...})`).
 */

function query(value) {
  const self = () => query(value);
  return {
    select: (..._args) => self(),
    populate: (..._args) => self(),
    sort: (..._args) => self(),
    lean: () => Promise.resolve(value),
    then: (onFulfilled, onRejected) => Promise.resolve(value).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(value).catch(onRejected),
  };
}

/**
 * Same chainable/awaitable shape as query(), but it rejects - used to simulate
 * a Mongoose error (CastError / driver failure) on a chained query. The
 * rejection is always returned to the caller (or awaited), so it never becomes
 * an unhandled promise rejection.
 */
function queryReject(error) {
  const self = () => queryReject(error);
  return {
    select: (..._args) => self(),
    populate: (..._args) => self(),
    sort: (..._args) => self(),
    lean: () => Promise.reject(error),
    then: (onFulfilled, onRejected) => Promise.reject(error).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.reject(error).catch(onRejected),
  };
}

/** Real Mongoose throws this for a malformed ObjectId; the controllers do not handle it. */
function castError(path, value) {
  const mongoose = require('mongoose');
  return new mongoose.Error.CastError('ObjectId', value, path);
}

/** Real Mongoose throws this when schema validation fails on create/save. */
function validationError(message, path) {
  const mongoose = require('mongoose');
  const err = new mongoose.Error.ValidationError();
  err.errors = {
    [path || 'field']: new mongoose.Error.ValidatorError({ path: path || 'field', message }),
  };
  err.message = message;
  return err;
}

/** Real MongoDB throws a duplicate-key error (code 11000) when a unique index is violated. */
function duplicateKeyError(keyValue) {
  const err = new Error(`E11000 duplicate key error collection: test.orders index: orderId_1 dup key: { orderId: "${keyValue}" }`);
  err.name = 'MongoServerError';
  err.code = 11000;
  return err;
}

const User = {
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
};

const Banner = {
  find: jest.fn(() => query([])),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

const Category = {
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

const Deal = {
  find: jest.fn(() => query([])),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(() => query(null)),
  findByIdAndDelete: jest.fn(),
};

const FoodItem = {
  find: jest.fn(() => query([])),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(() => query(null)),
  bulkWrite: jest.fn(() => Promise.resolve({ modifiedCount: 0 })),
};

const Review = {
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
};

const Order = {
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  create: jest.fn(),
  aggregate: jest.fn(() => Promise.resolve([])),
};

const Settings = {
  findOne: jest.fn(() => query(null)),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(() => query(null)),
};

const Voucher = {
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  findById: jest.fn(() => query(null)),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

const models = { User, Banner, Category, Deal, FoodItem, Order, Review, Settings, Voucher };

/** A realistic User document returned by the mocked User model. */
function userDoc(over = {}) {
  const id = (over && over._id) || '507f1f77bcf86cd799439011';
  return {
    _id: id,
    id,
    name: 'Test User',
    email: 'test.user@example.com',
    phone: '03001234567',
    password: 'hashed-password-value',
    avatar: 'http://img.local/avatar.png',
    role: 'user',
    city: 'Lahore',
    address: '1 Test Street',
    totalOrders: 0,
    totalSpent: 0,
    membershipTier: 'Bronze',
    createdAt: new Date('2024-01-15T00:00:00Z'),
    resetPasswordOtp: null,
    resetPasswordToken: null,
    resetPasswordExpire: null,
    resetPasswordLastSentAt: null,
    resetPasswordResendCount: 0,
    save: jest.fn(function save() { return Promise.resolve(this); }),
    matchPassword: jest.fn(() => Promise.resolve(true)),
    generateAuthToken: jest.fn(() => 'mock-jwt-token'),
    ...over,
  };
}

/** Signs a JWT with the same secret the middleware/generateAuthToken use. */
function signToken(payload, options) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(payload, process.env.jwttoken || 'defaultsecretkey', options);
}

/** Re-establishes the default (empty) behaviour for every model method. */
function resetModelMocks() {
  Object.keys(models).forEach((name) => {
    Object.keys(models[name]).forEach((method) => {
      models[name][method].mockReset();
    });
  });

  User.findOne.mockImplementation(() => query(null));
  User.findById.mockImplementation(() => query(null));
  User.create.mockResolvedValue(undefined);

  Banner.find.mockImplementation(() => query([]));
  Banner.findById.mockImplementation(() => query(null));
  Banner.create.mockResolvedValue(undefined);
  Banner.findByIdAndDelete.mockResolvedValue(undefined);

  Category.find.mockImplementation(() => query([]));
  Category.findOne.mockImplementation(() => query(null));
  Category.findById.mockImplementation(() => query(null));
  Category.create.mockResolvedValue(undefined);
  Category.findByIdAndDelete.mockResolvedValue(undefined);

  Deal.find.mockImplementation(() => query([]));
  Deal.findById.mockImplementation(() => query(null));
  Deal.create.mockResolvedValue(undefined);
  Deal.findByIdAndUpdate.mockImplementation(() => query(null));
  Deal.findByIdAndDelete.mockResolvedValue(undefined);

  FoodItem.find.mockImplementation(() => query([]));
  FoodItem.findById.mockImplementation(() => query(null));
  FoodItem.create.mockResolvedValue(undefined);
  FoodItem.findByIdAndUpdate.mockImplementation(() => query(null));
  FoodItem.bulkWrite.mockResolvedValue({ modifiedCount: 0 });

  Review.find.mockImplementation(() => query([]));
  Review.findOne.mockImplementation(() => query(null));
  Review.findById.mockImplementation(() => query(null));
  Review.create.mockResolvedValue(undefined);

  Order.find.mockImplementation(() => query([]));
  Order.findOne.mockImplementation(() => query(null));
  Order.create.mockResolvedValue(undefined);

  Settings.findOne.mockImplementation(() => query(null));
  Settings.create.mockResolvedValue(undefined);
  Settings.findOneAndUpdate.mockImplementation(() => query(null));

  Voucher.find.mockImplementation(() => query([]));
  Voucher.findOne.mockImplementation(() => query(null));
  Voucher.findById.mockImplementation(() => query(null));
  Voucher.create.mockResolvedValue(undefined);
  Voucher.findByIdAndDelete.mockResolvedValue(undefined);
}

module.exports = {
  query,
  queryReject,
  castError,
  validationError,
  duplicateKeyError,
  models,
  resetModelMocks,
  userDoc,
  signToken,
  User,
  Banner,
  Category,
  Deal,
  FoodItem,
  Order,
  Review,
  Settings,
  Voucher,
};
