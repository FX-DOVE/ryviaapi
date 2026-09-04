import { Router } from 'express';
import {
  getWalletSummary,
  getLedger,
  estimateProduction,
  initializeTopup,
  verifyTopup,
  getJobCostPublic,
  redeemCoupon,
} from '../controllers/billingController.js';

const router = Router();

router.get('/wallet', getWalletSummary);
router.get('/ledger', getLedger);
router.post('/estimate', estimateProduction);
router.post('/initialize', initializeTopup);
router.get('/verify', verifyTopup);
router.post('/verify', verifyTopup);
router.get('/jobs/:id/cost', getJobCostPublic);
router.post('/coupons/redeem', redeemCoupon);

export default router;
