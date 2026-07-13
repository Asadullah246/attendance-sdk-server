import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { saveDeviceData } from '../utils/dataLogger';
import { getPrisma } from '../database/prisma';

const router = Router();
const prisma = getPrisma();

// --- ALL DEVICE REQUESTS CONSOLE LOGGER ---
router.use((req: Request, res: Response, next: Function) => {
  // Ignore getrequest to prevent log spam
  if (req.originalUrl.includes('/getrequest')) {
    return next();
  }

  console.log(`\n======================================================`);
  console.log(`📡 [DEVICE REQUEST] ${req.method} ${req.originalUrl}`);
  console.log(`======================================================`);
  
  if (Object.keys(req.query).length > 0) {
    console.log(`🔍 [QUERY PARAMS]:`);
    console.log(req.query);
  }
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 [RAW BODY]:`);
    console.log(typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2));
  }
  
  console.log(`------------------------------------------------------\n`);
  next();
});

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

  // Parse ATTLOG (Attendance Logs)
  if (table === 'ATTLOG' && typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // Example format: 1\t2026-07-13 12:17:51\t255\t1\t0\t0\t0\t0\t0\t0\t
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const uid = parseInt(parts[0], 10);
        const timestampStr = parts[1]; // YYYY-MM-DD HH:MM:SS
        const state = parts.length > 2 ? parseInt(parts[2], 10) : null;
        const verifyType = parts.length > 3 ? parseInt(parts[3], 10) : null;

        if (!isNaN(uid) && timestampStr) {
          try {
            await prisma.attendanceLog.upsert({
              where: {
                deviceSn_uid_punchTime: {
                  deviceSn: sn,
                  uid: uid,
                  punchTime: new Date(timestampStr),
                }
              },
              create: {
                deviceSn: sn,
                uid: uid,
                punchTime: new Date(timestampStr),
                status: state,
                verifyType: verifyType,
                source: 'push',
                rawData: line,
              },
              update: {} // Do nothing if it exists
            });
            logger.info(`[Push] Saved attendance for UID: ${uid} at ${timestampStr}`);
          } catch (e) {
            logger.error(`[Push] Failed to save attendance`, { error: (e as Error).message });
          }
        }
      }
    }
  }
  // Parse USERINFO (User Sync from device)
  if ((table === 'USER' || table === 'USERINFO') && typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // Could be TSV like: PIN\tName\tPri\tPass\tCard...
      // Or Key-Value like: PIN=1\tName=John...
      const parts = line.split('\t');
      let uidStr = '';
      let name = '';
      let privilege = 0;

      if (line.includes('PIN=')) {
        // Key-Value format
        parts.forEach(p => {
          if (p.startsWith('PIN=')) uidStr = p.replace('PIN=', '');
          if (p.startsWith('Name=')) name = p.replace('Name=', '');
          if (p.startsWith('Pri=')) privilege = parseInt(p.replace('Pri=', ''), 10);
        });
      } else if (parts.length >= 2) {
        // TSV format
        uidStr = parts[0];
        name = parts[1];
        privilege = parts.length > 2 ? parseInt(parts[2], 10) : 0;
      }

      const uid = parseInt(uidStr, 10);
      if (!isNaN(uid)) {
        try {
          await prisma.user.upsert({
            where: { id: uid },
            create: {
              uid: uid,
              name: name || `User ${uid}`,
              privilege: isNaN(privilege) ? 0 : privilege,
            },
            update: {
              name: name || `User ${uid}`,
              privilege: isNaN(privilege) ? 0 : privilege,
            }
          });
          logger.info(`[Push] Synced user UID: ${uid}, Name: ${name}`);
        } catch (e) {
          logger.error(`[Push] Failed to sync user`, { error: (e as Error).message });
        }
      }
    }
  }

  sendADMSResponse(res, 'OK\n');
});

/**
 * 3. GET /iclock/getrequest
 * Device polls for pending commands to execute.
 */
router.get('/getrequest', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  
  // Make it extremely visible in the terminal
  // console.log(`\n======================================================`);
  // console.log(`📡 [DEVICE PING] GET /iclock/getrequest from SN: ${sn || 'UNKNOWN'}`);
  // console.log(`======================================================\n`);

  // logger.info(`[Push] Polling for commands from ${sn}`);
  // saveDeviceData('getrequest', 'GET', req.query, null, sn);

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
  } else if (typeof rawBody === 'object' && rawBody !== null && rawBody.ID) {
    // Handled by urlencoded parser
    const cmdId = parseInt(rawBody.ID as string, 10);
    const returnCode = rawBody.Return as string;
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
      } catch (error) {}
    }
  }

  sendADMSResponse(res, 'OK\n');
});

export default router;
