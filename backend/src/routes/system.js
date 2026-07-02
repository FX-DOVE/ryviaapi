import { Router }    from 'express';
import { getHealth, getMetrics, getReady, getLive, getVersion, getLedger, getStats, promoteToAdmin } from '../controllers/systemController.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';

const router = Router();

// Public check endpoints
router.get('/ready',   getReady);
router.get('/live',    getLive);
router.get('/version', getVersion);

// Protected admin endpoints
router.get('/health',  authMiddleware, getHealth);
router.get('/metrics', authMiddleware, requireRoles(['admin']), getMetrics);
router.get('/ledger',  authMiddleware, requireRoles(['admin']), getLedger);
router.get('/stats',   authMiddleware, requireRoles(['admin']), getStats);
router.post('/promote', authMiddleware, requireRoles(['admin']), promoteToAdmin);

export default router;
