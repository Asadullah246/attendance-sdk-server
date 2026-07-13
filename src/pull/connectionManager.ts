import ZKTeco from 'zkteco-js';
import logger from '../utils/logger';
import config from '../config';

export interface DeviceConnection {
  device: any; // ZKTeco instance (library doesn't export types)
  connected: boolean;
  connectedAt: Date;
  ip: string;
  port: number;
}

export interface ConnectionStatus {
  connected: boolean;
  ip: string;
  port: number;
  connectedAt?: Date;
  uptime?: number;
}

export interface ConnectionInfo {
  key: string;
  ip: string;
  port: number;
  connected: boolean;
  connectedAt: Date;
}

/**
 * Manages TCP socket connections to ZKTeco devices.
 * Keeps track of active connections and provides connect/disconnect/status methods.
 */
class ConnectionManager {
  private connections: Map<string, DeviceConnection> = new Map();

  /**
   * Connect to a ZKTeco device via TCP socket
   */
  async connect(ip: string, port: number = config.defaultDevicePort): Promise<{ success: boolean; message: string; device: any }> {
    const key = `${ip}:${port}`;

    // Return existing connection if already connected
    if (this.connections.has(key)) {
      const existing = this.connections.get(key)!;
      if (existing.connected) {
        logger.debug(`Already connected to ${key}`);
        return { success: true, message: 'Already connected', device: existing.device };
      }
    }

    logger.info(`Connecting to device at ${key}...`);

    try {
      const device = new ZKTeco(ip, port, config.connectionTimeout, 4000);
      await device.createSocket();

      this.connections.set(key, {
        device,
        connected: true,
        connectedAt: new Date(),
        ip,
        port,
      });

      logger.info(`✅ Connected to device at ${key}`);
      return { success: true, message: `Connected to ${key}`, device };
    } catch (error) {
      const err = error as Error;
      logger.error(`❌ Failed to connect to ${key}`, { error: err.message });

      // Clean up failed connection
      this.connections.delete(key);

      throw new Error(`Failed to connect to device at ${key}: ${err.message}`);
    }
  }

  /**
   * Disconnect from a ZKTeco device
   */
  async disconnect(ip: string, port: number = config.defaultDevicePort): Promise<{ success: boolean; message: string }> {
    const key = `${ip}:${port}`;
    const conn = this.connections.get(key);

    if (!conn) {
      return { success: true, message: `No active connection to ${key}` };
    }

    try {
      await conn.device.disconnect();
      this.connections.delete(key);
      logger.info(`Disconnected from ${key}`);
      return { success: true, message: `Disconnected from ${key}` };
    } catch (error) {
      const err = error as Error;
      // Force remove from map even if disconnect fails
      this.connections.delete(key);
      logger.warn(`Force disconnected from ${key}`, { error: err.message });
      return { success: true, message: `Force disconnected from ${key}` };
    }
  }

  /**
   * Get connection status for a device
   */
  getStatus(ip: string, port: number = config.defaultDevicePort): ConnectionStatus {
    const key = `${ip}:${port}`;
    const conn = this.connections.get(key);

    if (!conn || !conn.connected) {
      return { connected: false, ip, port };
    }

    return {
      connected: true,
      ip,
      port,
      connectedAt: conn.connectedAt,
      uptime: Math.floor((Date.now() - conn.connectedAt.getTime()) / 1000),
    };
  }

  /**
   * Get the ZKTeco device instance for an active connection
   */
  getDevice(ip: string, port: number = config.defaultDevicePort): any | null {
    const key = `${ip}:${port}`;
    const conn = this.connections.get(key);
    return conn?.connected ? conn.device : null;
  }

  /**
   * Get all active connections
   */
  getAllConnections(): ConnectionInfo[] {
    const result: ConnectionInfo[] = [];
    for (const [key, conn] of this.connections) {
      result.push({
        key,
        ip: conn.ip,
        port: conn.port,
        connected: conn.connected,
        connectedAt: conn.connectedAt,
      });
    }
    return result;
  }

  /**
   * Disconnect from all devices (used during shutdown)
   */
  async disconnectAll(): Promise<void> {
    const promises = [];
    for (const [, conn] of this.connections) {
      promises.push(this.disconnect(conn.ip, conn.port));
    }
    await Promise.allSettled(promises);
    logger.info('All device connections closed');
  }
}

// Export singleton instance
export default new ConnectionManager();
