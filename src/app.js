import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { isDatabaseUp } from './db.js';
import { authRoutes } from './routes/auth.routes.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins
  }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    const databaseUp = isDatabaseUp();
    res.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  if (!config.isTest) {
    const authLimiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      limit: config.rateLimit.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Tente novamente mais tarde.',
          timestamp: new Date().toISOString()
        });
      }
    });
    app.use('/api/v1/auth', authLimiter, authRoutes);
  } else {
    app.use('/api/v1/auth', authRoutes);
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
