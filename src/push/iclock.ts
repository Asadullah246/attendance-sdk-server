import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { saveDeviceData } from '../utils/dataLogger';
import { getPrisma } from '../database/prisma';
import { WebhookService } from '../services/webhookService';

const router = Router();
const prisma = getPrisma();

// The noisy console logger has been removed for production. 
// Use logger.debug if request inspection is needed.

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

  logger.info(`[Push] Data Received from ${sn} for table ${table}`);
  
  // Save exact payload for analysis
  saveDeviceData('cdata', 'POST', req.query, rawBody, sn);

  if (sn) {
    // Update last activity
    prisma.device.update({
      where: { serialNumber: sn },
      data: { isOnline: true, lastActivity: new Date() },
    }).catch(e => logger.warn(`[Push] Error updating activity for ${sn}`, { error: e.message }));
  }

  let dbHasError = false;

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
            // The device sends local time (BD time) without a timezone: '2026-07-13 12:17:51'
            // We append +06:00 so the Node.js server correctly parses it as Bangladesh time, 
            // even if the server is deployed in UTC (like AWS).
            const bdTimeStr = timestampStr.replace(' ', 'T') + '+06:00';
            const punchTimeDate = new Date(bdTimeStr);

            const log = await prisma.attendanceLog.upsert({
              where: {
                deviceSn_uid_punchTime: {
                  deviceSn: sn,
                  uid: uid,
                  punchTime: punchTimeDate,
                }
              },
              create: {
                deviceSn: sn,
                uid: uid,
                punchTime: punchTimeDate,
                status: state,
                verifyType: verifyType,
                source: 'push',
                rawData: line,
              },
              update: {} // Do nothing if it exists
            });
            logger.info(`[Push] Saved attendance for UID: ${uid} at ${timestampStr}`);
            
            // Trigger Webhook
            WebhookService.queueWebhook('attendance', log);
          } catch (e) {
            logger.error(`[Push] Failed to save attendance`, { error: (e as Error).message });
            dbHasError = true;
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
          const user = await prisma.user.upsert({
            where: { id: uid },
            create: {
              uid: uid,
              name: name || `User ${uid}`,
              privilege: isNaN(privilege) ? 0 : privilege,
              status: 'active',
            },
            update: {
              name: name || `User ${uid}`,
              privilege: isNaN(privilege) ? 0 : privilege,
              status: 'active',
            }
          });
          logger.info(`[Push] Synced user UID: ${uid}, Name: ${name}`);
          
          // Trigger Webhook
          WebhookService.queueWebhook('user_synced_from_device', { deviceSn: sn, user });

          // Broadcast to ALL OTHER connected devices
          const allDevices = await prisma.device.findMany({ where: { isOnline: true } });
          for (const device of allDevices) {
            if (device.serialNumber !== sn) {
              const cmdData = `DATA UPDATE USERINFO PIN=${uid} Name=${name} Pri=${user.privilege}`;
              await prisma.commandQueue.create({
                data: {
                  deviceSn: device.serialNumber,
                  commandType: 'UPDATE_USERINFO',
                  commandData: cmdData,
                  status: 'pending',
                }
              });
            }
          }
        } catch (e) {
          logger.error(`[Push] Failed to sync user`, { error: (e as Error).message });
          dbHasError = true;
        }
      }
    }
  }

  // Parse FP (Fingerprint) or FACE (Face) or BIODATA
  if ((table === 'FP' || table === 'FACE' || table === 'BIODATA') && typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // Key-Value format: PIN=1001 FID=0 Size=250 Valid=1 TMP=...
      const parts = line.split('\t');
      let uidStr = '';
      let fidStr = '0';
      let sizeStr = '0';
      let validStr = '1';
      let tmp = '';
      
      parts.forEach(p => {
        if (p.startsWith('PIN=')) uidStr = p.replace('PIN=', '');
        if (p.startsWith('FID=')) fidStr = p.replace('FID=', '');
        if (p.startsWith('Size=')) sizeStr = p.replace('Size=', '');
        if (p.startsWith('Valid=')) validStr = p.replace('Valid=', '');
        if (p.startsWith('TMP=')) tmp = p.replace('TMP=', '');
      });

      const uid = parseInt(uidStr, 10);
      if (!isNaN(uid) && tmp) {
        try {
          const typeCode = table === 'FACE' ? 15 : 1; // 1 = Finger, 15 = Face

          // @ts-ignore - Prisma client not fully regenerated due to file lock, but DB schema is updated
          await prisma.biometricTemplate.upsert({
            where: {
              uid_type_fingerId: {
                uid: uid,
                type: typeCode,
                fingerId: parseInt(fidStr, 10),
              }
            },
            create: {
              uid: uid,
              type: typeCode,
              fingerId: parseInt(fidStr, 10),
              size: parseInt(sizeStr, 10) || 0,
              valid: parseInt(validStr, 10) || 1,
              template: tmp,
              deviceSn: sn,
            },
            update: {
              size: parseInt(sizeStr, 10) || 0,
              valid: parseInt(validStr, 10) || 1,
              template: tmp,
              deviceSn: sn,
            }
          });
          logger.info(`[Push] Saved biometric (${table}) for UID: ${uid}`);

          // Broadcast to ALL OTHER connected devices
          const allDevices = await prisma.device.findMany({ where: { isOnline: true } });
          for (const device of allDevices) {
            if (device.serialNumber !== sn) {
              const cmdPrefix = table === 'FACE' ? 'DATA UPDATE FACE' : 'DATA UPDATE FINGER';
              const cmdData = `${cmdPrefix} PIN=${uidStr} FID=${fidStr} Size=${sizeStr} Valid=${validStr} TMP=${tmp}`;
              
              await prisma.commandQueue.create({
                data: {
                  deviceSn: device.serialNumber,
                  commandType: 'UPDATE_BIOMETRIC',
                  commandData: cmdData,
                  status: 'pending',
                }
              });
            }
          }
        } catch (e) {
          logger.error(`[Push] Failed to save biometric`, { error: (e as Error).message });
          dbHasError = true;
        }
      }
    }
  }

  // If the database threw an error (e.g. unreachable), we MUST NOT return OK.
  // Returning an error forces the device to retain the logs in memory and retry later!
  if (dbHasError) {
    logger.warn(`[Push] Returning HTTP 500 to device ${sn} due to DB errors. Device will retry later.`);
    return res.status(500).send('ERROR\n');
  }

  sendADMSResponse(res, 'OK\n');
});

/**
 * 3. GET /iclock/getrequest
 * Device polls for pending commands to execute.
 */
router.get('/getrequest', async (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  
  logger.info(`[Push] Device Polling (getrequest) from SN: ${sn || 'UNKNOWN'}`);

  logger.info(`[Push] Polling for commands from ${sn}`);
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
          const cmd = await prisma.commandQueue.update({
            where: { id: cmdId },
            data: {
              status: returnCode === '0' ? 'completed' : 'failed',
              result: returnCode,
              completedAt: new Date(),
            },
          });
          WebhookService.queueWebhook('command_completed', cmd);
          
          // --- USER SYNC STATUS UPDATES ---
          if (returnCode === '0' && cmd.commandData) {
            if (cmd.commandData.startsWith('DATA UPDATE USERINFO')) {
              // Extract PIN
              const pinMatch = cmd.commandData.match(/PIN=(\d+)/);
              if (pinMatch && pinMatch[1]) {
                await prisma.user.updateMany({
                  where: { uid: parseInt(pinMatch[1], 10) },
                  data: { status: 'active' }
                });
              }
            } else if (cmd.commandData.startsWith('DATA DELETE USERINFO')) {
              const pinMatch = cmd.commandData.match(/PIN=(\d+)/);
              if (pinMatch && pinMatch[1]) {
                await prisma.user.deleteMany({
                  where: { uid: parseInt(pinMatch[1], 10) }
                });
              }
            }
          }
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
        const cmd = await prisma.commandQueue.update({
          where: { id: cmdId },
          data: {
            status: returnCode === '0' ? 'completed' : 'failed',
            result: returnCode,
            completedAt: new Date(),
          },
        });
        WebhookService.queueWebhook('command_completed', cmd);

        // --- USER SYNC STATUS UPDATES ---
        if (returnCode === '0' && cmd.commandData) {
          if (cmd.commandData.startsWith('DATA UPDATE USERINFO')) {
            // Extract PIN
            const pinMatch = cmd.commandData.match(/PIN=(\d+)/);
            if (pinMatch && pinMatch[1]) {
              await prisma.user.updateMany({
                where: { uid: parseInt(pinMatch[1], 10) },
                data: { status: 'active' }
              });
            }
          } else if (cmd.commandData.startsWith('DATA DELETE USERINFO')) {
            const pinMatch = cmd.commandData.match(/PIN=(\d+)/);
            if (pinMatch && pinMatch[1]) {
              await prisma.user.deleteMany({
                where: { uid: parseInt(pinMatch[1], 10) }
              });
            }
          }
        }
      } catch (error) {}
    }
  }

  sendADMSResponse(res, 'OK\n');
});

export default router;
