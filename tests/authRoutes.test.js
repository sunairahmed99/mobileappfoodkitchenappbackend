// C. Auth routes (Controllers/authController.js): register, login, OTP and
// password reset. Also contains the password-reset account-takeover chain
// (parent test 1) and the user-enumeration finding (parent test 5).
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
  query,
  userDoc,
  signToken,
  validationError,
  resetModelMocks,
} from './helpers/modelMocks.cjs';

const VALID_REGISTER = {
  name: 'Ali Khan',
  email: 'Ali@Example.com',
  phone: '03001234567',
  city: 'Lahore',
  password: 'secret123',
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  resetModelMocks();
  sendEmail.mockResolvedValue({ success: true, messageId: 'mock-message-id' });
});

describe('C1. POST /api/auth/register', () => {
  test('success -> 201 with token and a user object without password fields', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) => Promise.resolve({
      _id: 'new-user-id',
      ...doc,
      createdAt: new Date(),
      generateAuthToken: () => 'mock-jwt-token',
    }));

    const res = await request(app).post('/api/auth/register').send(VALID_REGISTER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('mock-jwt-token');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body.user)).not.toMatch(/password/i);

    const created = User.create.mock.calls[0][0];
    expect(created.email).toBe('ali@example.com'); // lower-cased + trimmed
    expect(created.name).toBe('Ali Khan');
    expect(created.role).toBeUndefined(); // mass-assignment guard: role is not taken from the body
  });

  test.each([
    ['name', { name: undefined }, 'Name is required'],
    ['email', { email: undefined }, 'Email address is required'],
    ['city', { city: undefined }, 'City is required'],
    ['password', { password: undefined }, 'Password is required'],
  ])('missing required field "%s" -> 400', async (_field, override, message) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, ...override });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('phone that is not exactly 11 digits -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, phone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Phone number must be exactly 11 digits');
  });

  test('password shorter than 6 characters -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, password: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Password must be at least 6 characters long');
  });

  test('confirmPassword mismatch -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, confirmPassword: 'somethingelse' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Passwords do not match');
  });

  test('duplicate email -> 400 with the "already exists" message', async () => {
    User.findOne.mockImplementation(() => query(userDoc()));

    const res = await request(app).post('/api/auth/register').send(VALID_REGISTER);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('An account with this email address already exists. Please log in.');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('VALIDATION: invalid email format is rejected with 400 before any DB access', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Please provide a valid email address' });
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test('VALIDATION: over-long name, city and address are rejected with 400', async () => {
    User.findOne.mockImplementation(() => query(null));

    const longName = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, name: 'A'.repeat(121) });
    expect(longName.status).toBe(400);
    expect(longName.body.message).toBe('Name must be 120 characters or fewer');

    const longCity = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, city: 'C'.repeat(61) });
    expect(longCity.status).toBe(400);
    expect(longCity.body.message).toBe('City must be 60 characters or fewer');

    const longAddress = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTER, address: 'D'.repeat(501) });
    expect(longAddress.status).toBe(400);
    expect(longAddress.body.message).toBe('Address must be 500 characters or fewer');

    expect(User.create).not.toHaveBeenCalled();
  });
});

describe('C2. POST /api/auth/login', () => {
  test('missing email or password -> 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Please provide both email and password' });
  });

  test('non-existent user -> 401 (same message as a wrong password: no enumeration)', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'secret123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid email or password. Please try again.' });
  });

  test('wrong password -> 401 with the same generic message', async () => {
    const user = userDoc({ matchPassword: jest.fn(() => Promise.resolve(false)) });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/login').send({ email: 'test.user@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid email or password. Please try again.' });
  });

  test('regular user -> 200 with token and no password in the body', async () => {
    const user = userDoc({ role: 'user', matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/login').send({ email: 'Test.User@Example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresOtp).toBe(false);
    expect(res.body.token).toBe('mock-jwt-token');
    expect(res.body.user.password).toBeUndefined();
    // e-mail is lower-cased before the query
    expect(User.findOne.mock.calls[0][0].email).toBe('test.user@example.com');
  });

  test('admin -> 200 with requiresOtp: true, a 6-digit OTP e-mailed, and no token', async () => {
    const admin = userDoc({ role: 'admin', matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findOne.mockImplementation(() => query(admin));

    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requiresOtp).toBe(true);
    expect(res.body.token).toBeUndefined();
    expect(admin.loginOtp).toMatch(/^\d{6}$/);
    expect(admin.resetPasswordOtp).toBeNull(); // the reset flow is untouched by login
    expect(admin.resetPasswordExpire).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('test.user@example.com');
  });

  test('DEV_SHOW_OTP unset -> the login code never travels in the response body', async () => {
    delete process.env.DEV_SHOW_OTP;
    const admin = userDoc({ role: 'admin', matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findOne.mockImplementation(() => query(admin));

    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.devOtp).toBeUndefined();
  });

  test('DEV_SHOW_OTP=true -> the same code is returned so a local machine can log in', async () => {
    const previous = process.env.DEV_SHOW_OTP;
    process.env.DEV_SHOW_OTP = 'true';
    try {
      const admin = userDoc({ role: 'admin', matchPassword: jest.fn(() => Promise.resolve(true)) });
      User.findOne.mockImplementation(() => query(admin));

      const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' });

      expect(res.status).toBe(200);
      expect(res.body.requiresOtp).toBe(true);
      expect(res.body.devOtp).toMatch(/^\d{6}$/);
      expect(res.body.devOtp).toBe(admin.loginOtp);
    } finally {
      if (previous === undefined) delete process.env.DEV_SHOW_OTP;
      else process.env.DEV_SHOW_OTP = previous;
    }
  });

  test('admin login when the OTP e-mail fails -> 500 and the OTP is cleared', async () => {
    const admin = userDoc({ role: 'admin', matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findOne.mockImplementation(() => query(admin));
    sendEmail.mockRejectedValue(new Error('Email delivery failed: SMTP down'));

    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'secret123' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to send verification email. Please try again.');
    expect(admin.loginOtp).toBeNull();
  });
});

describe('C2b. POST /api/auth/google', () => {
  const GOOGLE_PAYLOAD = {
    email: 'google.user@gmail.com',
    name: 'Google User',
    avatar: 'https://lh3.googleusercontent.com/avatar.jpg',
    googleId: 'google-sub-id-123',
  };

  test('new user via Google -> 200, creates account with authProvider=google and googleId stored', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) =>
      Promise.resolve({
        _id: 'google-user-id',
        ...doc,
        createdAt: new Date(),
        generateAuthToken: () => 'google-jwt-token',
      })
    );

    const res = await request(app).post('/api/auth/google').send(GOOGLE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('google-jwt-token');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body.user)).not.toMatch(/password/i);

    // Verify correct fields were stored
    const created = User.create.mock.calls[0][0];
    expect(created.email).toBe('google.user@gmail.com');
    expect(created.authProvider).toBe('google');
    expect(created.googleId).toBe('google-sub-id-123');
    expect(created.role).toBe('user');
    expect(created.status).toBe('Active');
    // mass-assignment guard: role cannot be elevated via Google endpoint
    expect(created.role).not.toBe('admin');
  });

  test('existing user signs in via Google -> 200 with existing account JWT', async () => {
    const existingUser = userDoc({ email: 'google.user@gmail.com' });
    User.findOne.mockImplementation(() => query(existingUser));

    const res = await request(app).post('/api/auth/google').send(GOOGLE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('mock-jwt-token');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('existing user with no custom avatar adopts Google avatar', async () => {
    const existingUser = userDoc({
      email: 'google.user@gmail.com',
      avatar: 'https://images.unsplash.com/photo-default.jpg',
      googleId: null,
      authProvider: 'local',
    });
    User.findOne.mockImplementation(() => query(existingUser));

    await request(app).post('/api/auth/google').send(GOOGLE_PAYLOAD);

    expect(existingUser.save).toHaveBeenCalled();
    expect(existingUser.avatar).toBe('https://lh3.googleusercontent.com/avatar.jpg');
    expect(existingUser.googleId).toBe('google-sub-id-123');
  });

  test('blocked user is denied with 403', async () => {
    const blockedUser = userDoc({ email: 'google.user@gmail.com', status: 'Blocked' });
    User.findOne.mockImplementation(() => query(blockedUser));

    const res = await request(app).post('/api/auth/google').send(GOOGLE_PAYLOAD);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/blocked/i);
    expect(res.body.token).toBeUndefined();
  });

  test('missing email without token -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ name: 'No Email User' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email/i);
  });

  test('invalid email format -> 400', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({ ...GOOGLE_PAYLOAD, email: 'not-valid-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('A valid Google email address is required.');
  });

  test('email is normalized to lowercase', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) =>
      Promise.resolve({
        _id: 'new-id',
        ...doc,
        createdAt: new Date(),
        generateAuthToken: () => 'token-xyz',
      })
    );

    await request(app)
      .post('/api/auth/google')
      .send({ ...GOOGLE_PAYLOAD, email: 'GOOGLE.USER@GMAIL.COM' });

    const created = User.create.mock.calls[0][0];
    expect(created.email).toBe('google.user@gmail.com');
  });

  test('SECURITY: role field in body is ignored (always stored as user)', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) =>
      Promise.resolve({
        _id: 'id',
        ...doc,
        createdAt: new Date(),
        generateAuthToken: () => 't',
      })
    );

    await request(app)
      .post('/api/auth/google')
      .send({ ...GOOGLE_PAYLOAD, role: 'admin' });

    const created = User.create.mock.calls[0][0];
    expect(created.role).toBe('user');
  });

  test('response user object contains authProvider field', async () => {
    User.findOne.mockImplementation(() => query(null));
    User.create.mockImplementation((doc) =>
      Promise.resolve({
        _id: 'id',
        ...doc,
        createdAt: new Date(),
        generateAuthToken: () => 't',
      })
    );

    const res = await request(app).post('/api/auth/google').send(GOOGLE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.user.authProvider).toBe('google');
    expect(res.body.user.googleId).toBe('google-sub-id-123');
  });
});

describe('C3. POST /api/auth/verify-login-otp', () => {
  test('missing email or otp -> 400', async () => {
    const res = await request(app).post('/api/auth/verify-login-otp').send({ email: 'admin@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Email and OTP code are required' });
  });

  test('invalid or expired OTP -> 400', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/auth/verify-login-otp').send({ email: 'admin@example.com', otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid or expired verification code. Please try again.' });
  });

  test('valid admin OTP -> 200 with a token, redirectToAdmin and cleared login OTP fields', async () => {
    const admin = userDoc({ role: 'admin', loginOtp: '123456', loginOtpExpire: new Date(Date.now() + 600000) });
    User.findOne.mockImplementation(() => query(admin));

    const res = await request(app).post('/api/auth/verify-login-otp').send({ email: 'admin@example.com', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('mock-jwt-token');
    expect(res.body.redirectToAdmin).toBe(true);
    expect(admin.loginOtp).toBeNull();
    expect(admin.loginOtpExpire).toBeNull();
    expect(admin.resetPasswordOtp).toBeNull();
    expect(res.body.user.password).toBeUndefined();
  });

  test('SECURITY: a password-reset OTP cannot be used as an admin login OTP', async () => {
    // The stored reset OTP must not satisfy the login-OTP query: the account has
    // a reset OTP but no login OTP, so the lookup cannot match.
    const admin = userDoc({ role: 'admin', resetPasswordOtp: '123456', resetPasswordExpire: new Date(Date.now() + 600000) });
    User.findOne.mockImplementation((filter) => query(
      filter && admin.loginOtp && admin.loginOtp === filter.loginOtp ? admin : null
    ));

    const res = await request(app).post('/api/auth/verify-login-otp').send({ email: 'admin@example.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired verification code. Please try again.');
    expect(res.body.token).toBeUndefined();
  });
});

describe('C4. POST /api/auth/forgot-password', () => {
  test('missing email -> 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide your registered email address');
  });

  test('SECURITY: unknown email gets a generic 200 with no account-enumerating message', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).not.toMatch(/no registered user found/i);
    expect(res.body.resendCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('SECURITY: known and unknown emails produce an identical response body', async () => {
    User.findOne.mockImplementation(() => query(null));
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });

    const user = userDoc();
    User.findOne.mockImplementation(() => query(user));
    const known = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  // The response body of this PUBLIC endpoint must never contain the
  // password-reset credential - it now only exists server-side.
  test('SECURITY (Critical): forgot-password never returns the reset credential', async () => {
    const user = userDoc();
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body)).not.toContain('resetToken');
    expect(JSON.stringify(res.body)).not.toContain(user.resetPasswordToken);
    expect(res.body.resendCount).toBe(0);
  });

  test('SECURITY (Critical): the e-mailed OTP is the only reset credential a caller ever sees', async () => {
    const user = userDoc();
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
    expect(res.body.otp).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].html).toContain(user.resetPasswordOtp);
  });

  // The account-takeover chain is broken: no reset credential is exposed by the
  // API, so an attacker has nothing to replay.
  test('SECURITY (Critical): no reset credential is exposed, so the takeover chain is broken', async () => {
    const victim = userDoc({ _id: 'victim-account', email: 'victim@example.com', password: 'original-hash' });
    User.findOne.mockImplementation(() => query(victim));

    // Step 1 - attacker asks for a reset for the victim's address (no auth needed).
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: victim.email });
    expect(forgot.status).toBe(200);
    expect(forgot.body.resetToken).toBeUndefined();

    // Step 2 - the attacker only has a guess; the attacker does not know the
    // server-side token because it is never returned by the API.
    expect(victim.resetPasswordToken).toBeTruthy();
    User.findOne.mockImplementation((filter) => query(
      filter && filter.resetPasswordToken === victim.resetPasswordToken ? victim : null
    ));

    const reset = await request(app).post('/api/auth/reset-password').send({
      email: victim.email,
      token: 'attacker-guessed-token',
      newPassword: 'attacker-password',
    });

    expect(reset.status).toBe(400);
    expect(reset.body.success).toBe(false);
    expect(victim.password).toBe('original-hash'); // password was NOT replaced
  });

  test('resend limit: 3 already-used resends -> 429', async () => {
    const user = userDoc({
      resetPasswordToken: 'active-token',
      resetPasswordOtp: '111111',
      resetPasswordExpire: new Date(Date.now() + 600000),
      resetPasswordLastSentAt: new Date(Date.now() - 60000),
      resetPasswordResendCount: 3,
    });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/maximum of 3 OTP resends/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('resend cooldown: a request within 10s of the previous one -> 429', async () => {
    const user = userDoc({
      resetPasswordToken: 'active-token',
      resetPasswordOtp: '111111',
      resetPasswordExpire: new Date(Date.now() + 600000),
      resetPasswordLastSentAt: new Date(),
      resetPasswordResendCount: 0,
    });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/Please wait \d+ seconds/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('happy path (new request) -> 200 and a 6-digit OTP is e-mailed', async () => {
    const user = userDoc();
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(200);
    expect(user.resetPasswordOtp).toMatch(/^\d{6}$/);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/\d{6}/);
  });

  test('OTP e-mail failure -> 500 and the reset state is cleared', async () => {
    const user = userDoc();
    User.findOne.mockImplementation(() => query(user));
    sendEmail.mockRejectedValue(new Error('Email delivery failed: SMTP down'));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(500);
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordOtp).toBeNull();
  });
});

describe('C5. POST /api/auth/verify-reset-otp', () => {
  test('missing email or otp -> 400', async () => {
    const res = await request(app).post('/api/auth/verify-reset-otp').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please enter your email address and verification code.');
  });

  test('invalid or expired OTP -> 400', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/auth/verify-reset-otp').send({ email: 'a@b.com', otp: '000000' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid or expired code. Please check the code and try again.' });
  });

  test('valid OTP -> 200', async () => {
    const user = userDoc({ resetPasswordOtp: '654321', resetPasswordExpire: new Date(Date.now() + 600000) });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/verify-reset-otp').send({ email: user.email, otp: '654321' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Verification code confirmed.' });
  });
});

describe('C6. POST /api/auth/reset-password', () => {
  test('missing new password -> 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ email: 'a@b.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New password is required');
  });

  test('new password shorter than 6 characters -> 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ email: 'a@b.com', otp: '123456', newPassword: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Password must be at least 6 characters long');
  });

  test('neither otp nor token supplied -> 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ email: 'a@b.com', newPassword: 'newsecret' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide the OTP verification code or reset token');
  });

  test('invalid or expired OTP -> 400', async () => {
    User.findOne.mockImplementation(() => query(null));

    const res = await request(app).post('/api/auth/reset-password').send({ email: 'a@b.com', otp: '999999', newPassword: 'newsecret' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or expired OTP code. Please request a new code.');
  });

  test('happy path with a valid OTP -> 200 with a fresh JWT and no password in the body', async () => {
    const user = userDoc({ resetPasswordOtp: '246810', resetPasswordExpire: new Date(Date.now() + 600000) });
    User.findOne.mockImplementation(() => query(user));

    const res = await request(app).post('/api/auth/reset-password').send({ email: user.email, otp: '246810', newPassword: 'newsecret' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('mock-jwt-token');
    expect(res.body.user.password).toBeUndefined();
    expect(user.password).toBe('newsecret');
  });

  test('SECURITY (High): an OTP-only request without an email is rejected with 400', async () => {
    const victim = userDoc({ _id: 'victim-account', email: 'victim@example.com' });
    User.findOne.mockImplementation(() => query(victim));

    const res = await request(app).post('/api/auth/reset-password').send({ otp: '123456', newPassword: 'hijacked-pass' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide the email address of the account you are resetting.');
    expect(User.findOne).not.toHaveBeenCalled();
    expect(victim.password).toBe('hashed-password-value');
  });

  test('SECURITY (High): the OTP can only unlock the account named in the same request', async () => {
    const victim = userDoc({ _id: 'victim-account', email: 'victim@example.com' });
    // The lookup must carry BOTH the email and the OTP.
    User.findOne.mockImplementation((filter) => query(
      filter && filter.email === victim.email && filter.resetPasswordOtp === '123456' ? victim : null
    ));

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'attacker@example.com', otp: '123456', newPassword: 'hijacked-pass' });

    expect(res.status).toBe(400);
    expect(User.findOne.mock.calls[0][0].email).toBe('attacker@example.com');
    expect(User.findOne.mock.calls[0][0].resetPasswordOtp).toBe('123456');
    expect(victim.password).toBe('hashed-password-value');
  });

  test('VALIDATION: supplying both an OTP and a reset token is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'a@b.com', otp: '123456', token: 'abc', newPassword: 'newsecret' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide either the OTP verification code or the reset token, not both');
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

describe('C7. PUT /api/auth/change-password (authenticated)', () => {
  const roleUser = () => {
    const user = userDoc({ matchPassword: jest.fn(() => Promise.resolve(true)) });
    User.findById.mockImplementation(() => query(user));
    return user;
  };

  test('missing fields -> 400', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ newPassword: 'NewPass123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Please provide current password, new password, and confirmation');
  });

  test('new password shorter than 8 characters -> 400', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'oldpass123', newPassword: 'Ab1', confirmPassword: 'Ab1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New password must be at least 8 characters long');
  });

  test('new password without an uppercase letter or digit -> 400', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'oldpass123', newPassword: 'alllowercase', confirmPassword: 'alllowercase' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New password must contain an uppercase letter and a number');
  });

  test('confirmation mismatch -> 400', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'oldpass123', newPassword: 'NewPass123', confirmPassword: 'OtherPass123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New passwords do not match');
  });

  test('new password identical to the current one -> 400', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'NewPass123', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('New password must be different from your current password');
  });

  test('incorrect current password -> 400', async () => {
    const user = userDoc({ matchPassword: jest.fn(() => Promise.resolve(false)) });
    User.findById.mockImplementation(() => query(user));

    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'wrongpass1', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect');
  });

  test('happy path -> 200', async () => {
    roleUser();
    const res = await request(app)
      .put('/api/auth/change-password')
      .set(authHeader(signToken({ id: 'u1', role: 'user' })))
      .send({ currentPassword: 'oldpass123', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Password changed successfully! ✅' });
  });

  test('unauthenticated -> 401', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .send({ currentPassword: 'oldpass123', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });

    expect(res.status).toBe(401);
  });
});
