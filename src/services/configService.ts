import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export class ConfigService {
  /**
   * Fetch a config value by key.
   */
  static async getConfig(key: string): Promise<string | null> {
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });
    return config?.value || null;
  }

  /**
   * Fetch a config value as a number.
   */
  static async getConfigNumber(key: string, defaultValue: number): Promise<number> {
    const val = await this.getConfig(key);
    if (!val) return defaultValue;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Fetch a config value as a boolean.
   */
  static async getConfigBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    const val = await this.getConfig(key);
    if (!val) return defaultValue;
    return val.toLowerCase() === 'true';
  }

  /**
   * Upsert a config entry.
   */
  static async setConfig(key: string, value: string, description?: string) {
    try {
      const config = await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value, description },
        update: { value, description: description ?? undefined }
      });
      return config;
    } catch (error) {
      logger.error(`[ConfigService] Failed to set config ${key}`, { error: (error as Error).message });
      throw new Error(`Failed to set config: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch all system configs.
   */
  static async getAllConfigs() {
    return prisma.systemConfig.findMany({
      orderBy: { key: 'asc' }
    });
  }

  /**
   * Insert default configs if they don't exist.
   */
  static async seedDefaults() {
    try {
      const defaultConfigs = [
        {
          key: 'duplicate_threshold_minutes',
          value: '3',
          description: 'Ignore duplicate punches within this window (minutes)'
        },
        {
          key: 'calculation_cron',
          value: '0 2 * * *',
          description: 'Cron schedule for calculation engine (default: 2:00 AM daily)'
        },
        {
          key: 'auto_mark_absent',
          value: 'true',
          description: 'Auto-mark employees with no punches as absent'
        },
        {
          key: 'overtime_threshold_minutes',
          value: '30',
          description: 'Minimum overtime minutes to count'
        }
      ];

      for (const conf of defaultConfigs) {
        const existing = await this.getConfig(conf.key);
        if (!existing) {
          await this.setConfig(conf.key, conf.value, conf.description);
          logger.info(`[ConfigService] Seeded default config: ${conf.key}=${conf.value}`);
        }
      }
    } catch (error) {
      logger.error(`[ConfigService] Failed to seed defaults`, { error: (error as Error).message });
    }
  }
}
