import { Router }    from 'express';
import {
  getHealth, getMetrics, getReady, getLive, getVersion, getLedger, getStats, getUsers,
  promoteToAdmin, demoteUser, grantCredits, sendBulkEmail,
  createCoupon, listCoupons, disableCoupon,
} from '../controllers/systemController.js';
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
router.get('/users',   authMiddleware, requireRoles(['admin']), getUsers);
router.post('/promote', authMiddleware, requireRoles(['admin']), promoteToAdmin);
router.post('/demote',  authMiddleware, requireRoles(['admin']), demoteUser);
router.post('/credits/grant', authMiddleware, requireRoles(['admin']), grantCredits);
router.post('/email/bulk', authMiddleware, requireRoles(['admin']), sendBulkEmail);
router.get('/coupons', authMiddleware, requireRoles(['admin']), listCoupons);
router.post('/coupons', authMiddleware, requireRoles(['admin']), createCoupon);
router.post('/coupons/:id/disable', authMiddleware, requireRoles(['admin']), disableCoupon);

export default router;
