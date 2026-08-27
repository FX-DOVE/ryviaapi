import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-video-factory';

  mongoose.set('strictQuery', true);

  const maxRetries = 10;
  const retryInterval = 5000; // 5 seconds
  let retries = 0;

  while (retries < maxRetries) {
    try {
      console.log(`[DB] Connecting to MongoDB (attempt ${retries + 1}/${maxRetries})...`);
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      isConnected = true;
      console.log('[DB] MongoDB connected:', uri);

      mongoose.connection.on('disconnected', () => {
        isConnected = false;
        console.warn('[DB] MongoDB disconnected — will reconnect automatically');
      });

      mongoose.connection.on('error', (err) => {
        console.error('[DB] MongoDB error:', err.message);
      });

      return; // Connected successfully
    } catch (err) {
      retries++;
      console.warn(`[DB] ⚠️ MongoDB connection attempt ${retries} failed (${uri}): ${err.message}`);
      if (retries < maxRetries) {
        console.log(`[DB] Retrying in ${retryInterval / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        console.error(`[DB] ❌ MongoDB connection failed after ${maxRetries} attempts.`);
        throw err;
      }
    }
  }
}

export default connectDB;
