import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import config from './index';
import logger from '../utils/logger';

export function initializeSentry(): void {
  if (config.sentryDsn) {
    try {
      Sentry.init({
        dsn: config.sentryDsn,
        environment: config.nodeEnv,
        integrations: [
          nodeProfilingIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: config.isDev ? 1.0 : 0.1, //  Capture 100% of the transactions in dev, 10% in prod
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: 1.0,
      });
      logger.info('✅ GlitchTip (Sentry) initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize GlitchTip (Sentry)', error);
    }
  } else {
    logger.warn('⚠️ SENTRY_DSN is not set. GlitchTip error tracking is disabled.');
  }
}

// Call initialization immediately upon import
initializeSentry();
