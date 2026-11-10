import crypto from 'crypto';
import User from '../Models/User.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { sendEmail } from '../Config/email.js';
import { handleControllerError } from '../Utils/errorResponse.js';
import { verifyGoogleToken } from '../Config/google.js';

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
const MAX_NAME_LENGTH = 120;
const MAX_CITY_LENGTH = 60;
const MAX_ADDRESS_LENGTH = 500;

// Generic message used for password-reset requests so the response can never be
// used to find out whether an email address is registered.
const GENERIC_RESET_MESSAGE =
  'If an account exists for this email address, a password reset code has been sent.';

const isString = (value) => typeof value === 'string';
const isBlank = (value) => value === undefined || value === null || (isString(value) && !value.trim());

/**
 * Dev-only convenience: when DEV_SHOW_OTP=true the admin login OTP is also returned
 * in the response (and logged server-side) so a local machine can be tested without
 * mailbox access. It is opt-in and therefore OFF by default — never leave this enabled
 * on a public deployment, otherwise anyone who knows the admin password also gets the
 * second factor for free.
 */
const isDevOtpVisible = () => String(process.env.DEV_SHOW_OTP || '').trim().toLowerCase() === 'true';

/**
 * Format user response object (exclude sensitive fields)
 */
const formatUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  fullName: user.name,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  role: user.role,
  city: user.city || '',
  address: user.address || '',
  totalOrders: user.totalOrders || 0,
  totalSpent: user.totalSpent || 0,
  membershipTier: user.membershipTier || 'Bronze',
  status: user.status || 'Active',
  googleId: user.googleId || null,
  authProvider: user.authProvider || 'local',
  joinedDate: user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Recently',
});

/**
 * @desc    Register a new user with Cloudinary avatar upload
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req, res) => {
  try {
    const { name, fullName, email, phone, city, password, confirmPassword, conformpassword, address } = req.body || {};
    const userName = name || fullName;
    const userConfirmPassword = confirmPassword || conformpassword;

    // 1. Validation - every problem here is client-caused and must be a 400,
    //    never an unhandled 500 from a downstream type error.
    if (!isString(userName) || !userName.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (userName.trim().length > MAX_NAME_LENGTH) {
      return res.status(400).json({ success: false, message: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
    }
    if (isBlank(email)) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }
    if (!isString(email) || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    if (!isString(phone) || !/^\d{11}$/.test(phone.trim())) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 11 digits' });
    }
    if (isBlank(city)) {
      return res.status(400).json({ success: false, message: 'City is required' });
    }
    if (!isString(city) || city.trim().length > MAX_CITY_LENGTH) {
      return res.status(400).json({ success: false, message: `City must be ${MAX_CITY_LENGTH} characters or fewer` });
    }
    if (address !== undefined && (!isString(address) || address.trim().length > MAX_ADDRESS_LENGTH)) {
      return res.status(400).json({ success: false, message: `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer` });
    }
    if (!isString(password) || !password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }
    if (userConfirmPassword && password !== userConfirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Check existing user
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    // 3. Handle Cloudinary Avatar Upload
    let avatar = req.body.avatar || req.body.imageUrl;
    let cloudinaryId = null;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/users', req.file.originalname || 'image.jpg', req.file.mimetype);
      avatar = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    if (!avatar) {
      // Default cute avatar
      avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
    }

    // 4. Create User in MongoDB
    const user = await User.create({
      name: userName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      password,
      avatar,
      cloudinaryId,
      city: city.trim(),
      address: address ? address.trim() : '',
    });

    // 5. Generate JWT Token
    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to Homefoods Kitchen 🎉',
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error during registration');
  }
};

/**
 * @desc    Login - Step 1: verify credentials. Admin gets OTP to email, user logs in directly.
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isString(email) || !email.trim() || !isString(password) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    // Check user & select password field explicitly
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please try again.',
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please try again.',
      });
    }

    // Blocked by the admin from the Customer Directory — credentials are valid
    // but access is denied until the account is unblocked.
    if (user.status === 'Blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked by the administrator. Please contact support.',
      });
    }

    // ─── ADMIN: 2-Step Login — send OTP to email ────────────────────────────
    if (user.role === 'admin') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // Dedicated login OTP fields: the password-reset fields stay untouched so
      // a reset code can never double as a login code.
      user.loginOtp = otp;
      user.loginOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save({ validateBeforeSave: false });

      const htmlMessage = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #FF7A00; margin: 0; font-size: 26px; font-weight: 800;">FOOD KITCHEN</h1>
            <p style="color: #6B7280; font-size: 13px; margin-top: 4px;">Admin Security Verification</p>
          </div>
          <div style="background-color: #FFF7ED; border-left: 4px solid #FF7A00; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
            <h2 style="color: #111827; margin: 0 0 6px 0; font-size: 18px;">🔐 Admin Login Verification</h2>
            <p style="color: #4B5563; font-size: 14px; margin: 0;">Hello <strong>${user.name}</strong>, a login attempt was made to your admin account. Use the code below to complete sign-in.</p>
          </div>
          <div style="text-align: center; margin: 28px 0; padding: 20px; background-color: #F9FAFB; border-radius: 8px;">
            <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Your 6-Digit Verification Code</p>
            <div style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #FF7A00; font-family: monospace;">${otp}</div>
            <p style="color: #EF4444; font-size: 12px; margin-top: 8px;">⏱️ Expires in 10 minutes.</p>
          </div>
          <p style="color: #6B7280; font-size: 13px; line-height: 20px;">If you did not attempt this login, please change your password immediately.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <div style="text-align: center; color: #9CA3AF; font-size: 11px;">
            &copy; ${new Date().getFullYear()} Food Kitchen Admin Panel. All rights reserved.
          </div>
        </div>
      `;

      try {
        await sendEmail({
          to: user.email,
          subject: `🔐 Admin Login Code: ${otp} — Food Kitchen`,
          html: htmlMessage,
        });
      } catch (emailError) {
        user.loginOtp = null;
        user.loginOtpExpire = null;
        await user.save({ validateBeforeSave: false });
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification email. Please try again.',
        });
      }

      const showDevOtp = isDevOtpVisible();

      return res.status(200).json({
        success: true,
        requiresOtp: true,
        message: `A 6-digit verification code has been sent to ${user.email}`,
        email: user.email,
        ...(showDevOtp ? { devOtp: otp } : {}),
      });
    }

    // ─── REGULAR USER: Direct login ─────────────────────────────────────────
    const token = user.generateAuthToken();
    res.status(200).json({
      success: true,
      requiresOtp: false,
      message: `Welcome back, ${user.name}! 👋`,
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error during login');
  }
};

/**
 * @desc    Google Sign-in / Sign-up
 * @route   POST /api/auth/google
 * @access  Public
 */
export const googleLogin = async (req, res) => {
  try {
    const { email, name, avatar, googleId, idToken, accessToken } = req.body || {};

    let targetEmail = email;
    let targetName = name;
    let targetAvatar = avatar;
    let targetGoogleId = googleId;

    // 1. Dynamic Server-Side Google Token Verification
    if ((idToken && isString(idToken)) || (accessToken && isString(accessToken))) {
      const googleResult = await verifyGoogleToken({ idToken, accessToken });

      if (googleResult.verified) {
        targetEmail = googleResult.email;
        targetName = googleResult.name || targetName;
        targetAvatar = googleResult.avatar || targetAvatar;
        targetGoogleId = googleResult.googleId || targetGoogleId;
      } else if (googleResult.error) {
        return res.status(401).json({
          success: false,
          message: googleResult.error,
        });
      }
    }

    // 2. Validate email address
    if (!targetEmail || !isString(targetEmail) || !EMAIL_REGEX.test(targetEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid Google email address is required.',
      });
    }

    const normalizedEmail = targetEmail.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Account authorization check: Blocked users cannot sign in
      if (user.status === 'Blocked') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been blocked by the administrator. Please contact support.',
        });
      }

      let modified = false;

      // Link googleId if not yet stored
      if (targetGoogleId && !user.googleId) {
        user.googleId = targetGoogleId;
        modified = true;
      }

      if (user.authProvider !== 'google' && !user.authProvider) {
        user.authProvider = 'google';
        modified = true;
      }

      // If user has no custom avatar or has default unsplash photo, adopt Google photo
      if (targetAvatar && (!user.avatar || user.avatar.includes('unsplash.com'))) {
        user.avatar = targetAvatar;
        modified = true;
      }

      if (modified) {
        await user.save({ validateBeforeSave: false });
      }
    } else {
      // Create new user for first-time Google sign-in
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const displayName =
        targetName && isString(targetName) && targetName.trim()
          ? targetName.trim()
          : normalizedEmail.split('@')[0];
      const userAvatar =
        targetAvatar ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

      user = await User.create({
        name: displayName,
        email: normalizedEmail,
        phone: '03000000000',
        city: 'Karachi',
        address: '',
        password: randomPassword,
        avatar: userAvatar,
        role: 'user',
        status: 'Active',
        googleId: targetGoogleId || null,
        authProvider: 'google',
      });
    }

    // 3. Generate JWT Token containing user id, email, and role
    const token = user.generateAuthToken();

    res.status(200).json({
      success: true,
      message: `Welcome, ${user.name}! Signed in with Google 🎉`,
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error during Google authentication');
  }
};

/**
 * @desc    Admin Login - Step 2: Verify OTP and complete login
 * @route   POST /api/auth/verify-login-otp
 * @access  Public
 */
export const verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};

    if (!isString(email) || !email.trim() || isBlank(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP code are required',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      role: 'admin',
      loginOtp: otp.toString().trim(),
      loginOtpExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please try again.',
      });
    }

    // Clear the login OTP fields (the reset OTP fields are never touched here)
    user.loginOtp = null;
    user.loginOtpExpire = null;
    await user.save({ validateBeforeSave: false });

    const token = user.generateAuthToken();

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}! Admin dashboard is ready. 🚀`,
      token,
      user: formatUserResponse(user),
      redirectToAdmin: true,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error during OTP verification');
  }
};


/**
 * @desc    Forgot Password - Send OTP & Reset token via Nodemailer Gmail
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!isString(email) || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your registered email address',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Identical generic answer for known and unknown addresses, so this
      // endpoint cannot be used to enumerate registered accounts.
      return res.status(200).json({
        success: true,
        message: GENERIC_RESET_MESSAGE,
        resendCount: 0,
      });
    }

    const now = Date.now();
    const hasActiveReset =
      user.resetPasswordToken &&
      user.resetPasswordOtp &&
      user.resetPasswordExpire?.getTime() > now;
    let resendCount = 0;

    if (hasActiveReset) {
      resendCount = user.resetPasswordResendCount || 0;
      if (resendCount >= 3) {
        return res.status(429).json({
          success: false,
          message: 'You have reached the maximum of 3 OTP resends. Please try again after the code expires.',
        });
      }

      const lastSentAt = user.resetPasswordLastSentAt?.getTime();
      const waitTime = lastSentAt ? 10_000 - (now - lastSentAt) : 0;
      if (waitTime > 0) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(waitTime / 1000)} seconds before requesting another code.`,
        });
      }
      resendCount += 1;
    }

    // Generate 6-digit numeric OTP and hex reset token
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetToken = crypto.randomBytes(24).toString('hex');

    // Token expires in 15 minutes
    user.resetPasswordOtp = otp;
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = now + 15 * 60 * 1000;
    user.resetPasswordLastSentAt = now;
    user.resetPasswordResendCount = resendCount;
    await user.save();

    // Nodemailer HTML template
    const htmlMessage = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #FF7A00; margin: 0; font-size: 26px; font-weight: 800;">FOOD KITCHEN</h1>
          <p style="color: #6B7280; font-size: 13px; margin-top: 4px;">Special Homemade Taste Delivered Fresh</p>
        </div>

        <div style="background-color: #FFF7ED; border-left: 4px solid #FF7A00; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
          <h2 style="color: #111827; margin: 0 0 6px 0; font-size: 18px;">Password Reset Request</h2>
          <p style="color: #4B5563; font-size: 14px; margin: 0;">Hello <strong>${user.name}</strong>, we received a request to reset your password. Use the verification code below to proceed.</p>
        </div>

        <div style="text-align: center; margin: 28px 0; padding: 20px; background-color: #F9FAFB; border-radius: 8px;">
          <p style="color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Your 6-Digit OTP Code</p>
          <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #111827; font-family: monospace;">
            ${otp}
          </div>
          <p style="color: #EF4444; font-size: 12px; margin-top: 8px;">⏱️ This code will expire in 15 minutes.</p>
        </div>

        <p style="color: #6B7280; font-size: 13px; line-height: 20px;">
          If you did not request this password reset, please ignore this email or contact our support team immediately. Your account remains completely secure.
        </p>

        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

        <div style="text-align: center; color: #9CA3AF; font-size: 11px;">
          &copy; ${new Date().getFullYear()} Food Kitchen. All rights reserved.<br />
          Delivering fresh homemade goodness to your doorstep.
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: `🔐 Your Password Reset Code: ${otp} — Food Kitchen`,
        html: htmlMessage,
      });

      res.status(200).json({
        success: true,
        message: GENERIC_RESET_MESSAGE,
        resendCount,
      });
    } catch (emailError) {
      // Invalidate the replaced OTP and allow a fresh request if delivery fails.
      user.resetPasswordOtp = null;
      user.resetPasswordToken = null;
      user.resetPasswordExpire = null;
      user.resetPasswordLastSentAt = null;
      user.resetPasswordResendCount = 0;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to send the password reset email. Please try again later.',
      });
    }
  } catch (error) {
    return handleControllerError(res, error, 'Server error during password reset request');
  }
};

/**
 * @desc Verify a password reset OTP before showing the password form
 * @route POST /api/auth/verify-reset-otp
 * @access Public
 */
export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!isString(email) || !email.trim() || isBlank(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your email address and verification code.',
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordOtp: otp.toString().trim(),
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired code. Please check the code and try again.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code confirmed.',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Could not verify the code. Please try again.');
  }
};

/**
 * @desc    Reset Password with OTP or Token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, token, newPassword, password, confirmPassword, conformpassword } = req.body || {};
    const finalPassword = newPassword || password;
    const finalConfirm = confirmPassword || conformpassword;

    if (!isString(finalPassword) || !finalPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required',
      });
    }

    if (finalPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    if (finalConfirm && finalPassword !== finalConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    // The account must always be identified by email so an OTP/token can only
    // ever unlock the account it was issued for.
    if (!isString(email) || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the email address of the account you are resetting.',
      });
    }

    if (!otp && !token) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the OTP verification code or reset token',
      });
    }

    if (otp && token) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either the OTP verification code or the reset token, not both',
      });
    }

    // Find the user by email AND exactly one credential
    const query = {
      email: email.toLowerCase().trim(),
      resetPasswordExpire: { $gt: Date.now() },
    };

    if (otp) {
      query.resetPasswordOtp = otp.toString().trim();
    } else {
      query.resetPasswordToken = token;
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code. Please request a new code.',
      });
    }

    // Update password
    user.password = finalPassword;
    user.resetPasswordOtp = null;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    user.resetPasswordLastSentAt = null;
    user.resetPasswordResendCount = 0;
    await user.save();

    // Generate new JWT session token
    const authToken = user.generateAuthToken();

    res.status(200).json({
      success: true,
      message: 'Password reset successful! You are now logged in.',
      token: authToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error during password reset');
  }
};

/**
 * @desc    Get currently authenticated user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error fetching user profile');
  }
};

/**
 * @desc    Update user profile (with Cloudinary avatar upload)
 * @route   PUT /api/auth/profile
 * @access  Private
 */
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, fullName, phone, city, address } = req.body || {};

    // Coerce + bound-check so unexpected types/lengths cannot reach Mongoose.
    if (name !== undefined || fullName !== undefined) {
      const nextName = String(name || fullName || '').trim();
      if (nextName.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ success: false, message: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
      }
      user.name = nextName;
    }
    if (phone !== undefined) user.phone = String(phone).trim();
    if (city !== undefined) {
      const nextCity = String(city).trim();
      if (nextCity.length > MAX_CITY_LENGTH) {
        return res.status(400).json({ success: false, message: `City must be ${MAX_CITY_LENGTH} characters or fewer` });
      }
      user.city = nextCity;
    }
    if (address !== undefined) {
      const nextAddress = String(address).trim();
      if (nextAddress.length > MAX_ADDRESS_LENGTH) {
        return res.status(400).json({ success: false, message: `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer` });
      }
      user.address = nextAddress;
    }

    // Handle new image upload
    if (req.file) {
      if (user.cloudinaryId) {
        await deleteFromCloudinary(user.cloudinaryId);
      }
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'homefoods/users', req.file.originalname || 'image.jpg', req.file.mimetype);
      user.avatar = uploadResult.secure_url;
      user.cloudinaryId = uploadResult.public_id;
    } else if (req.body.avatar) {
      user.avatar = req.body.avatar;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully ✅',
      user: formatUserResponse(user),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating profile');
  }
};

/**
 * @desc    Change password for authenticated user
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, conformpassword } = req.body || {};
    const finalConfirm = confirmPassword || conformpassword;

    if (!isString(currentPassword) || !isString(newPassword) || !isString(finalConfirm) || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password, new password, and confirmation',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must contain an uppercase letter and a number',
      });
    }

    if (newPassword !== finalConfirm) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account could not be found',
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from your current password',
      });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully! ✅',
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while changing password');
  }
};
