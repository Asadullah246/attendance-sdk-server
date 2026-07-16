import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';
import config from '../config';

const prisma = getPrisma();

export class WebhookService {
  /**
   * Queues a webhook payload for the Main Application
   */
  static async queueWebhook(eventType: string, payload: any) {
    try {
      let webhookUrl = '';

      if (eventType === 'time_card') {
        webhookUrl = config.timeCardWebhookUrl;
      } else if (eventType === 'raw_attendance') {
        webhookUrl = config.rawAttendanceWebhookUrl;
      } else {
        webhookUrl = config.commandWebhookUrl;
      }
      
      if (!webhookUrl) {
        // Silently skip if the specific webhook is not configured
        logger.warn(`[WebhookService] Skipping webhook ${eventType} because its URL is not set in .env`);
        return;
      }

      await prisma.webhookQueue.create({
        data: {
          url: webhookUrl,
          eventType,
          payload: JSON.stringify(payload),
          status: 'pending',
        },
      });
      
      logger.info(`[WebhookService] Queued ${eventType} event for Main App`);
    } catch (error) {
      logger.error(`[WebhookService] Failed to queue webhook`, { error: (error as Error).message });
    }
  }

  /**
   * Processes the queue (sends pending/failed webhooks)
   */
  static async processWebhooks() {
    try {
      // Find webhooks to process: pending or (failed and retryCount < 5)
      const queue = await prisma.webhookQueue.findMany({
        where: {
          OR: [
            { status: 'pending' },
            { status: 'failed', retryCount: { lt: 5 } }
          ]
        },
        orderBy: { createdAt: 'asc' },
        take: 100 // Process in larger batches
      });

      if (queue.length === 0) return;

      const promises = queue.map(async (item) => {
        try {
          const response = await fetch(item.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ZKTeco-Event': item.eventType,
              'x-api-key': config.webhookSecret,
            },
            body: item.payload,
            // Timeout after 5 seconds to prevent hanging
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            // Success!
            await prisma.webhookQueue.update({
              where: { id: item.id },
              data: { status: 'success', lastError: null },
            });
            logger.info(`[WebhookService] Successfully delivered webhook ${item.id} to ${item.url}`);
          } else {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
          }
        } catch (error) {
          // Failed to deliver
          const errorMessage = (error as Error).message;
          const newRetryCount = item.retryCount + 1;
          const newStatus = newRetryCount >= 5 ? 'dead' : 'failed'; // Mark dead if retries exhausted
          
          await prisma.webhookQueue.update({
            where: { id: item.id },
            data: {
              status: newStatus,
              retryCount: newRetryCount,
              lastError: errorMessage
            },
          });
          logger.warn(`[WebhookService] Delivery failed for webhook ${item.id} to ${item.url} (Attempt ${newRetryCount})`, { error: errorMessage });
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      logger.error(`[WebhookService] Queue processing error`, { error: (error as Error).message });
    }
  }
}
