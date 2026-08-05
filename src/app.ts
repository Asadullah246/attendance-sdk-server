import express, { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import logger from './utils/logger';
import { successResponse, formatUptime } from './utils/helpers';
import config from './config';

// Import routers
import commandRoutes from './api/routes/commands';
import deviceRoutes from './api/routes/devices';
import attendanceRoutes from './api/routes/attendance';
import userRoutes from './api/routes/users';
import authRoutes from './api/routes/auth';
import configRoutes from './api/routes/configs';
import shiftRoutes from './api/routes/shifts';
import scheduleRoutes from './api/routes/schedules';
import reportRoutes from './api/routes/reports';
import holidayRoutes from './api/routes/holidays';
import pushRouter from './push/iclock';
import { requireApiKey } from './api/middleware/auth';
import swaggerUi from 'swagger-ui-express';
import { generateSwaggerSpec } from './config/swagger';

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
    skip: (req) => req.url.includes('/iclock/getrequest'),
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  })
);

// ─── Sentry Universal Error Interceptor ──────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 400 && config.showAllErrors) {
      Sentry.withScope((scope) => {
        scope.setExtra('req.method', req.method);
        scope.setExtra('req.url', req.originalUrl);
        scope.setExtra('req.body', req.body);
        scope.setExtra('res.status', res.statusCode);
        scope.setExtra('res.body', body);
        
        let message = `HTTP Error ${res.statusCode} at ${req.originalUrl}`;
        if (body && typeof body === 'object' && 'message' in body) {
          message += `: ${(body as any).message}`;
        }
        
        Sentry.captureMessage(message, 'warning');
      });
    }
    return originalJson.call(this, body);
  };
  next();
});

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

// ─── GlitchTip Test Route ─────────────────────────────────────────────
app.get('/api/test-error', (_req: Request, res: Response) => {
  throw new Error('This is a test error to verify GlitchTip integration!');
});

// ─── Static Dashboard ──────────────────────────────────────────────────
app.use('/dashboard', express.static(path.join(process.cwd(), 'public')));

// ─── API Routes ──────────────────────────────────────────────────────

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(generateSwaggerSpec(), {
  swaggerOptions: {
    persistAuthorization: true,
  },
  customSiteTitle: 'ZKTeco SDK API Docs',
}));

// Basic Auth generation route (Phase 3)
app.use('/api/v1/auth', authRoutes);

// Protected APIs for the Main Application
app.use('/api/v1', requireApiKey); // Apply authentication to all subsequent /api/v1 routes

// Phase 4 Data APIs
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/configs', configRoutes);
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/holidays', holidayRoutes);

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
// The error handler must be before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

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
