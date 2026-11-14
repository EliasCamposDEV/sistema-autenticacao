import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from '../validation/auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), authController.register);
authRoutes.post('/login', validate(loginSchema), authController.login);
authRoutes.post('/refresh', validate(refreshSchema), authController.refresh);
authRoutes.post('/logout', validate(refreshSchema), authController.logout);
authRoutes.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
authRoutes.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
authRoutes.get('/me', requireAuth, authController.me);
