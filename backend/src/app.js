import 'dotenv/config';
import express       from 'express';
import http          from 'http';
import cors          from 'cors';
import helmet        from 'helmet';
import morgan        from 'morgan';
import compression   from 'compression';

import { initSocket, broadcast } from './config/socket.js';
import { errorHandler }          from './middleware/errorHandler.js';
import { authMiddleware }        from './middleware/auth.js';
import { getSystemHealth }       from './services/healthService.js';

import jobRoutes        from './routes/jobs.js';
import userRoutes       from './routes/users.js';
import systemRoutes     from './routes/system.js';
import providerRoutes   from './routes/providers.js';
import authRoutes       from './routes/auth.js';
import projectRoutes    from './routes/projects.js';
import screenplayRoutes from './routes/screenplays.js';
import filmCharRoutes   from './routes/filmCharacters.js';
import { seedBuiltinProviders } from './services/providerSeedService.js';
import rateLimit      from 'express-rate-limit';

const app    = express();
const server = http.createServer(app);

// ─── RATE LIMITING ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // max 200 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiter to all API endpoints
app.use('/api/', apiLimiter);

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
initSocket(server);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
// API V1
app.use('/api/v1/auth',             authRoutes);
app.use('/api/v1/jobs',             authMiddleware, jobRoutes);
app.use('/api/v1/users',            authMiddleware, userRoutes);
app.use('/api/v1/system',           systemRoutes);
app.use('/api/v1/providers',        authMiddleware, providerRoutes);
app.use('/api/v1/projects',         projectRoutes);
app.use('/api/v1/screenplays',      authMiddleware, screenplayRoutes);
app.use('/api/v1/film-characters',  authMiddleware, filmCharRoutes);

// Legacy compatibility
app.use('/api/auth',             authRoutes);
app.use('/api/jobs',             authMiddleware, jobRoutes);
app.use('/api/users',            authMiddleware, userRoutes);
app.use('/api/system',           systemRoutes);
app.use('/api/providers',        authMiddleware, providerRoutes);
app.use('/api/projects',         projectRoutes);
app.use('/api/screenplays',      authMiddleware, screenplayRoutes);
app.use('/api/film-characters',  authMiddleware, filmCharRoutes);



// Seed built-in providers into the DB (idempotent — safe to run on every restart)
seedBuiltinProviders().catch((err) =>
  console.error('[App] Provider seed failed:', err.message)
);

app.get('/api/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── SYSTEM HEALTH BROADCAST (every 30s) ────────────────────────────────────
setInterval(async () => {
  try {
    const health = await getSystemHealth();
    broadcast('system_health', health);
  } catch (err) {
    console.warn('[App] Health broadcast failed:', err.message);
  }
}, 30000);

export { app, server };
export default server;
