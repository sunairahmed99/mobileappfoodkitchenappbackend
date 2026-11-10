import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import connectDB from './Config/db.js';
import bannerRoutes from './Routes/bannerRoutes.js';
import categoryRoutes from './Routes/categoryRoutes.js';
import dealRoutes from './Routes/dealRoutes.js';
import authRoutes from './Routes/authRoutes.js';
import uploadRoutes from './Routes/uploadRoutes.js';
import settingsRoutes from './Routes/settingsRoutes.js';
import foodItemRoutes from './Routes/foodItemRoutes.js';
import orderRoutes from './Routes/orderRoutes.js';
import reviewRoutes from './Routes/reviewRoutes.js';
import voucherRoutes from './Routes/voucherRoutes.js';
import broadcastRoutes from './Routes/broadcastRoutes.js';
import userRoutes from './Routes/userRoutes.js';
import blogRoutes from './Routes/blogRoutes.js';
import paymentRoutes from './Routes/paymentRoutes.js';
import { seedDatabaseIfEmpty } from './Config/seeder.js';
import { mapError } from './Utils/errorResponse.js';
import { generalLimiter, sanitizeData } from './Middlewares/security.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB Database and auto-seed if empty.
connectDB().then(seedDatabaseIfEmpty).catch((error) => {
  console.error('Database startup failed:', error.message);
});

const app = express();

// Ensure Database is connected for Serverless (e.g. Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection middleware error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Database connection failed. Please try again.',
    });
  }
});

// Disable x-powered-by header
app.disable('x-powered-by');

// Security HTTP Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows mobile app to display hosted images
  })
);

// Gzip / Brotli Compression for fast, lightweight responses
app.use(compression());

// Performance & Response Time Profiling Middleware
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (elapsedMs > 250 && process.env.NODE_ENV !== 'test') {
      console.warn(`⚡ [SLOW API] ${req.method} ${req.originalUrl} - ${elapsedMs.toFixed(2)}ms (Status: ${res.statusCode})`);
    }
  });
  next();
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeData);

// Apply General Rate Limiter to API routes
app.use('/api', generalLimiter);

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Root Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Homefoods Backend API is running smoothly 🚀',
  });
});

// API Routes
app.use('/api/banners', bannerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/food-items', foodItemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/users', userRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/payment', paymentRoutes);



// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const mapped = mapError(err);
  const status = err.status || err.statusCode || mapped.status;

  if (status >= 500) {
    console.error('Unhandled Error:', err.name || 'Error', '-', err.message || 'unknown');
  }

  res.status(status).json({
    success: false,
    // Never echo internals for a server-side failure.
    message: status >= 500 ? 'Internal Server Error' : err.message || mapped.message,
  });
});

export default app;