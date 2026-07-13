import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import logger from './utils/logger';
import { successResponse, formatUptime } from './utils/helpers';

// Import routers
import testRoutes from './api/routes/test';

const app = express();

// ─── Global Middleware ───────────────────────────────────────────────
// Security headers
app.use(helmet());

// CORS — allow all origins in dev, restrict in production
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Parse URL-encoded bodies (needed for iClock push protocol)
app.use(express.urlencoded({ extended: true }));

// Parse raw text bodies (iClock sends tab-separated plain text)
app.use(express.text({ type: 'text/plain' }));

// HTTP request logging via Morgan → Winston
app.use(
  morgan('short', {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

// ─── Health Check ────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json(
    successResponse({
      status: 'ok',
      uptime: formatUptime(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    })
  );
});

// ─── API Routes ──────────────────────────────────────────────────────
// Test routes (Phase 1 — device connectivity testing)
app.use('/api/v1/test', testRoutes);

// ─── iClock Push Protocol Routes (Phase 2 — placeholder) ────────────
// Will be added in Phase 2
// app.use('/iclock', pushRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
});

export default app;
