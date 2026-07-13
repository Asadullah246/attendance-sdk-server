import { Router, Request, Response } from 'express';
import operations from '../../pull/operations';
import connectionManager from '../../pull/connectionManager';
import { successResponse, errorResponse, isValidIP } from '../../utils/helpers';
import logger from '../../utils/logger';
import config from '../../config';

const router = Router();

/**
 * Test Routes — Phase 1
 * Used to verify device connectivity before building full APIs.
 * These are development/debug routes.
 */

/**
 * GET /api/v1/test/ping?ip=192.168.x.x&port=4370
 * Quick reachability check — connect and immediately disconnect
 */
router.get('/ping', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port } = req.query as { ip?: string; port?: string };
    const targetIp = ip || config.defaultDeviceIp;

    if (!targetIp) {
      res.status(400).json(errorResponse('Missing IP address in query or .env configuration', 400));
      return;
    }

    if (!isValidIP(targetIp)) {
      res.status(400).json(errorResponse(`Invalid IP address: ${targetIp}`, 400));
      return;
    }

    const devicePort = port ? parseInt(port, 10) : config.defaultDevicePort;
    logger.info(`Pinging device at ${targetIp}:${devicePort}...`);

    const result = await operations.ping(targetIp, devicePort);

    if (result.reachable) {
      res.json(successResponse(result, 'Device is reachable'));
    } else {
      res.status(503).json(errorResponse('Device is not reachable', 503, result));
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Ping failed', { error: err.message });
    res.status(500).json(errorResponse(err.message, 500));
  }
});

/**
 * GET /api/v1/test/connect?ip=192.168.x.x&port=4370
 * Connect to device, get full info, disconnect, return device details
 */
router.get('/connect', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port } = req.query as { ip?: string; port?: string };
    const targetIp = ip || config.defaultDeviceIp;

    if (!targetIp) {
      res.status(400).json(errorResponse('Missing IP address in query or .env configuration', 400));
      return;
    }

    if (!isValidIP(targetIp)) {
      res.status(400).json(errorResponse(`Invalid IP address: ${targetIp}`, 400));
      return;
    }

    const devicePort = port ? parseInt(port, 10) : config.defaultDevicePort;
    logger.info(`Connecting to device at ${targetIp}:${devicePort} for info...`);

    const result = await operations.getDeviceInfo(targetIp, devicePort);

    res.json(successResponse(result, 'Device info retrieved successfully'));
  } catch (error) {
    const err = error as Error;
    logger.error('Connect test failed', { error: err.message });
    res.status(500).json(errorResponse(`Connection failed: ${err.message}`, 500));
  }
});

/**
 * GET /api/v1/test/status?ip=192.168.x.x&port=4370
 * Get comprehensive device status (info + user count + attendance count)
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port } = req.query as { ip?: string; port?: string };
    const targetIp = ip || config.defaultDeviceIp;

    if (!targetIp) {
      res.status(400).json(errorResponse('Missing IP address in query or .env configuration', 400));
      return;
    }

    if (!isValidIP(targetIp)) {
      res.status(400).json(errorResponse(`Invalid IP address: ${targetIp}`, 400));
      return;
    }

    const devicePort = port ? parseInt(port, 10) : config.defaultDevicePort;
    logger.info(`Getting device status for ${targetIp}:${devicePort}...`);

    const result = await operations.getDeviceStatus(targetIp, devicePort);

    res.json(successResponse(result, 'Device status retrieved'));
  } catch (error) {
    const err = error as Error;
    logger.error('Status check failed', { error: err.message });
    res.status(500).json(errorResponse(`Status check failed: ${err.message}`, 500));
  }
});

/**
 * GET /api/v1/test/users?ip=192.168.x.x&port=4370
 * Fetch all users enrolled on the device
 */
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port } = req.query as { ip?: string; port?: string };
    const targetIp = ip || config.defaultDeviceIp;

    if (!targetIp) {
      res.status(400).json(errorResponse('Missing IP address in query or .env configuration', 400));
      return;
    }

    if (!isValidIP(targetIp)) {
      res.status(400).json(errorResponse(`Invalid IP address: ${targetIp}`, 400));
      return;
    }

    const devicePort = port ? parseInt(port, 10) : config.defaultDevicePort;
    logger.info(`Fetching users from device at ${targetIp}:${devicePort}...`);

    const result = await operations.getUsers(targetIp, devicePort);

    res.json(successResponse(result, `Retrieved ${result.count} users from device`));
  } catch (error) {
    const err = error as Error;
    logger.error('Get users failed', { error: err.message });
    res.status(500).json(errorResponse(`Failed to get users: ${err.message}`, 500));
  }
});

/**
 * GET /api/v1/test/attendance?ip=192.168.x.x&port=4370
 * Fetch all attendance logs from the device
 */
router.get('/attendance', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port } = req.query as { ip?: string; port?: string };
    const targetIp = ip || config.defaultDeviceIp;

    if (!targetIp) {
      res.status(400).json(errorResponse('Missing IP address in query or .env configuration', 400));
      return;
    }

    if (!isValidIP(targetIp)) {
      res.status(400).json(errorResponse(`Invalid IP address: ${targetIp}`, 400));
      return;
    }

    const devicePort = port ? parseInt(port, 10) : config.defaultDevicePort;
    logger.info(`Fetching attendance from device at ${targetIp}:${devicePort}...`);

    const result = await operations.getAttendances(targetIp, devicePort);

    res.json(successResponse(result, `Retrieved ${result.count} attendance records from device`));
  } catch (error) {
    const err = error as Error;
    logger.error('Get attendance failed', { error: err.message });
    res.status(500).json(errorResponse(`Failed to get attendance: ${err.message}`, 500));
  }
});

/**
 * GET /api/v1/test/connections
 * List all currently active device connections
 */
router.get('/connections', (_req: Request, res: Response): void => {
  const connections = connectionManager.getAllConnections();
  res.json(
    successResponse(
      { count: connections.length, connections },
      `${connections.length} active connection(s)`
    )
  );
});

export default router;
