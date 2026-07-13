import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import logger from './utils/logger';
import { successResponse, formatUptime } from './utils/helpers';

// Import routers
import testRoutes from './api/routes/test';
import commandRoutes from './api/routes/commands';
import deviceRoutes from './api/routes/devices';
import attendanceRoutes from './api/routes/attendance';
import userRoutes from './api/routes/users';
import pushRouter from './push/iclock';

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

// Parse raw text bodies (iClock sometimes sends missing or weird content types)
app.use(express.text({ type: ['text/plain', 'application/unknown', '*/*'] }));

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

// ─── Static Dashboard ──────────────────────────────────────────────────
app.use('/dashboard', express.static(path.join(process.cwd(), 'public')));

// ─── API Routes ──────────────────────────────────────────────────────
// Test routes (Phase 1 — Pull connectivity testing)
app.use('/api/v1/test', testRoutes);

// Phase 4 Data APIs
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/users', userRoutes);

// Command routes (Phase 3 — Push Protocol commands)
app.use('/api/v1/commands', commandRoutes);

// ─── iClock Push Protocol Routes (Phase 2) ───────────────────────────
// ADMS devices hardcode their push endpoints to start with /iclock
app.use('/iclock', pushRouter);

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
