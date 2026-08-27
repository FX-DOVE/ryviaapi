import 'dotenv/config';
import express       from 'express';
import path          from 'path';
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
// Providers are configured via .env file

const app    = express();
const server = http.createServer(app);

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
initSocket(server);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/mock-storage', express.static(path.join(process.cwd(), 'storage', 'public', 'mock-storage')));

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
