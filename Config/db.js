import mongoose from 'mongoose';
import dns from 'dns';

// Fix for Windows DNS resolution for MongoDB Atlas SRV records when the machine
// cannot resolve SRV records via its default resolver.
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (error) {
  console.warn('DNS server setting warning:', error.message);
}

let cachedPromise = null;

const connectDB = async () => {
  // If already connected, reuse connection (critical for Vercel serverless)
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  const mongoUri = process.env.DATABASE || process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error('Database connection string is missing. Set DATABASE or MONGO_URI in your environment.');
  }

  try {
    cachedPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
    const conn = await cachedPromise;
    console.log(`Database connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    cachedPromise = null;
    console.error(`Database connection error: ${error.message}`);
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }
};

export default connectDB;

