import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS - configurable origin
  const corsOrigin = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((s) => s.trim());
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Body parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging - skip in test
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // Health check (no auth)
  app.get('/', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'DineFlow API', data: { status: 'ok' } });
  });

  // API routes
  app.use('/api', routes);

  // 404 - must come after routes
  app.use(notFoundHandler);

  // Centralized error handler (4-arg signature)
  app.use(errorHandler as unknown as (err: unknown, req: Request, res: Response, next: NextFunction) => void);

  return app;
}
