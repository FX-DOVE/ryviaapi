import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-video-factory';

  mongoose.set('strictQuery', true);

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
}

export default connectDB;
