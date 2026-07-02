import { Router } from 'express';
import { register, login, refreshToken, logout } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', register);
router.post('/login',    login);
router.post('/refresh',  refreshToken);
router.post('/logout',   authMiddleware, logout);

export default router;
