import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { saveDeviceData } from '../utils/dataLogger';
import { getPrisma } from '../database/prisma';

const router = Router();
const prisma = getPrisma();

/**
 * Common response for ZKTeco ADMS push protocol.
 * The device expects a plain text "OK" to acknowledge receipt.
 */
const sendADMSResponse = (res: Response, content: string = 'OK\n') => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(content);
};

/**
 * 1. GET /iclock/cdata
 * Device Handshake / Initialization.
 * The device sends its SN and options, expecting the server to send configuration/commands.
 */
router.get('/cdata', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  const options = req.query.options as string;

  logger.info(`[Push] Device Handshake - SN: ${sn}`, { query: req.query });
  saveDeviceData('cdata', 'GET', req.query, null, sn);

  if (sn) {
    // Upsert device in DB so we track it
    try {
      await prisma.device.upsert({
        where: { serialNumber: sn },
        update: {
          isOnline: true,
          lastActivity: new Date(),
          pushEnabled: true,
        },
        create: {
          serialNumber: sn,
          isOnline: true,
          lastActivity: new Date(),
          pushEnabled: true,
        },
      });
    } catch (dbError) {
      logger.error(`[Push] Failed to register device ${sn} in DB`, {
        error: (dbError as Error).message,
      });
    }
  }

  // ADMS requires returning registry configuration. A simple OK often suffices
  // but returning Registry=OK or typical config is safer.
  sendADMSResponse(res, 'Registry=OK\n');
});

/**
 * 2. POST /iclock/cdata
 * Device pushes real-time data (Attendance logs, User info, etc.)
 */
router.post('/cdata', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  const table = req.query.table as string; // 'ATTLOG', 'USER', 'OPERLOG'
  const rawBody = req.body; // text/plain payload

  logger.info(`[Push] Data Received from ${sn} for table ${table} ${res}`);
  // logger.info("datra",JSON.stringify(res))
  logger.info("rawBody",JSON.stringify(rawBody))
  
  // Save exact payload for analysis
  saveDeviceData('cdata', 'POST', req.query, rawBody, sn);

  if (sn) {
    // Update last activity
    prisma.device.update({
      where: { serialNumber: sn },
      data: { isOnline: true, lastActivity: new Date() },
    }).catch(e => logger.warn(`[Push] Error updating activity for ${sn}`, { error: e.message }));
  }

  // TODO: Add parser for ATTLOG strings to save to database once we analyze the JSON outputs
  // For now, we save raw text to the datas/ folder for analysis as requested by the user

  sendADMSResponse(res, 'OK\n');
});

/**
 * 3. GET /iclock/getrequest
 * Device polls for pending commands to execute.
 */
router.get('/getrequest', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  
  logger.info(`[Push] Polling for commands from ${sn}`);
  saveDeviceData('getrequest', 'GET', req.query, null, sn);

  if (sn) {
    // Update last activity
    prisma.device.update({
      where: { serialNumber: sn },
      data: { isOnline: true, lastActivity: new Date() },
    }).catch(e => logger.warn(`[Push] Error updating activity for ${sn}`, { error: e.message }));
  }

  // Check database for pending commands for this SN
  try {
    const pendingCommands = await prisma.commandQueue.findMany({
      where: { deviceSn: sn, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingCommands.length > 0) {
      // ADMS format: C:<CommandId>:<CommandString>
      let commandPayload = '';
      for (const cmd of pendingCommands) {
        commandPayload += `C:${cmd.id}:${cmd.commandData}\n`;
        
        // Mark as sent
        await prisma.commandQueue.update({
          where: { id: cmd.id },
          data: { status: 'sent', sentAt: new Date() },
        });
      }
      return sendADMSResponse(res, commandPayload);
    }
  } catch (error) {
    logger.error(`[Push] Error fetching commands for ${sn}`, { error: (error as Error).message });
  }

  // If no commands, send "OK"
  sendADMSResponse(res, 'OK\n');
});

/**
 * 4. POST /iclock/devicecmd
 * Device returns the result of executed commands.
 */
router.post('/devicecmd', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  const rawBody = req.body; // ID=1&Return=0&CMD=DATA...

  logger.info(`[Push] Command Result from ${sn}`);
  saveDeviceData('devicecmd', 'POST', req.query, rawBody, sn);

  if (sn) {
    // Update last activity
    prisma.device.update({
      where: { serialNumber: sn },
      data: { isOnline: true, lastActivity: new Date() },
    }).catch(e => logger.warn(`[Push] Error updating activity for ${sn}`, { error: e.message }));
  }

  // Parse result (ID=1&Return=0)
  // E.g., body is "ID=10&Return=0&CMD=Unlock\n"
  if (typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      const params = new URLSearchParams(line);
      const cmdId = parseInt(params.get('ID') || '0', 10);
      const returnCode = params.get('Return');
      
      if (cmdId > 0) {
        try {
          await prisma.commandQueue.update({
            where: { id: cmdId },
            data: {
              status: returnCode === '0' ? 'completed' : 'failed',
              result: returnCode,
              completedAt: new Date(),
            },
          });
        } catch (error) {
          logger.error(`[Push] Error updating command ${cmdId}`, { error: (error as Error).message });
        }
      }
    }
  }

  sendADMSResponse(res, 'OK\n');
});

export default router;
