import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export class WebhookService {
  /**
   * Queues a webhook payload for all active webhook subscriptions
   */
  static async queueWebhook(eventType: string, payload: any) {
    try {
      // Find all active webhooks that subscribe to this event (or '*')
      const activeWebhooks = await prisma.webhook.findMany({
        where: { isActive: true },
      });

      const targetWebhooks = activeWebhooks.filter(
        wh => wh.events === '*' || wh.events.includes(eventType)
      );

      if (targetWebhooks.length === 0) {
        return; // No webhooks care about this event
      }

      // Create a queue entry for each target webhook
      for (const wh of targetWebhooks) {
        await prisma.webhookQueue.create({
          data: {
            url: wh.url,
            eventType,
            payload: JSON.stringify(payload),
            status: 'pending',
          },
        });
      }
      
      logger.info(`[WebhookService] Queued ${eventType} event for ${targetWebhooks.length} endpoints`);
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
        take: 20 // Process in batches
      });

      if (queue.length === 0) return;

      for (const item of queue) {
        try {
          const response = await fetch(item.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-ZKTeco-Event': item.eventType,
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
      }
    } catch (error) {
      logger.error(`[WebhookService] Queue processing error`, { error: (error as Error).message });
    }
  }
}
