import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import { saveDeviceData } from '../utils/dataLogger';
import { getPrisma } from '../database/prisma';
import { WebhookService } from '../services/webhookService';
import { AttendanceCalculationService } from '../services/attendanceCalculationService';
import config from '../config';

const router = Router();
const prisma = getPrisma();

// The noisy console logger has been removed for production. 
// Use logger.debug if request inspection is needed.

/**
 * Common response for ZKTeco ADMS push protocol.
 * The device expects a plain text "OK" to acknowledge receipt.
 */
const sendADMSResponse = (res: Response, content: string = 'OK\r\n') => {
  res.setHeader('Content-Type', 'text/plain');
  // Ensure we use \r\n (CRLF) for all line endings, as ZKTeco C-firmware parsers will fail with just \n
  const safeContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  res.send(safeContent);
};

/**
 * 0. POST /iclock/registry
 * Some modern ZKTeco devices require a registry endpoint to complete their initial handshake.
 * If this returns 404, they refuse to poll /iclock/getrequest.
 */
router.post('/registry', (req: Request, res: Response) => {
  const sn = req.query.SN as string;
  logger.info(`[Push] Device Registry Request - SN: ${sn}`);
  // Some devices expect just a standard 'OK' to complete registration
  sendADMSResponse(res);
});

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
    try {
      // Check if device already exists
      const existingDevice = await prisma.device.findUnique({ where: { serialNumber: sn } });

      const device = await prisma.device.upsert({
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
          areaId: null, // Default to global
        },
      });

      // If this is a completely new device, queue existing users for initial sync
      if (!existingDevice) {
        logger.info(`[Push] New device ${sn} registered. Queuing initial user sync.`);
        // Fetch users matching the device's area (null = global users)
        const usersToSync = await prisma.user.findMany({ where: { areaId: device.areaId } });
        
        let queuedCount = 0;
        for (const user of usersToSync) {
          // Track sync state
          await prisma.userDevice.upsert({
            where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
            create: { userId: user.id, deviceId: device.id, syncedAt: null },
            update: { syncedAt: null }
          });

          // Queue UserInfo update
          const userCmd = `DATA UPDATE USERINFO PIN=${user.uid} Name=${user.name} Pri=${user.privilege}${user.cardNumber ? ` Card=${user.cardNumber}` : ''}`;
          await prisma.commandQueue.create({
            data: {
              deviceSn: device.serialNumber,
              commandType: 'UPDATE_USERINFO',
              commandData: userCmd,
              status: 'pending',
            }
          });

          // Queue Biometrics
          const biometrics = await prisma.biometricTemplate.findMany({ where: { uid: user.uid } });
          for (const bio of biometrics) {
            const cmdPrefix = bio.type === 15 ? 'DATA UPDATE FACE' : 'DATA UPDATE FINGER';
            const bioCmd = `${cmdPrefix} PIN=${user.uid} FID=${bio.fingerId} Size=${bio.size} Valid=${bio.valid} TMP=${bio.template}`;
            await prisma.commandQueue.create({
              data: {
                deviceSn: device.serialNumber,
                commandType: 'UPDATE_BIOMETRIC',
                commandData: bioCmd,
                status: 'pending',
              }
            });
          }
          queuedCount++;
        }
        logger.info(`[Push] Queued ${queuedCount} users for new device ${sn}.`);
      }
    } catch (dbError) {
      logger.error(`[Push] Failed to register device ${sn} in DB`, {
        error: (dbError as Error).message,
      });
    }
  }

  // Return proper ADMS initialization options so the device knows how to poll
  // TransFlag=1111111111 tells the device to push ALL data (including BIODATA/fingerprints)
  const optionsResponse = `GET OPTION FROM: ${sn}\r\nStamp=9999\r\nOpStamp=9999\r\nErrorDelay=60\r\nDelay=10\r\nTransTimes=00:00;14:00\r\nTransInterval=1\r\nTransFlag=1111111111\r\nTimeZone=${config.deviceTimezoneOffset}\r\nRealtime=1\r\nEncrypt=0\r\n`;
  sendADMSResponse(res, optionsResponse);
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
  logger.info(`[Push Raw Data] \n${typeof rawBody === 'object' ? JSON.stringify(rawBody, null, 2) : rawBody}`);
  
  // Save exact payload for analysis
  saveDeviceData('cdata', 'POST', req.query, rawBody, sn);

  let sourceDevice = null;
  if (sn) {
    try {
      // Update last activity and fetch device for areaId
      sourceDevice = await prisma.device.update({
        where: { serialNumber: sn },
        data: { isOnline: true, lastActivity: new Date() },
      });
    } catch (e) {
      logger.warn(`[Push] Error updating activity for ${sn}`, { error: (e as Error).message });
    }
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
            // The device sends local time without a timezone: '2026-07-13 12:17:51'
            // We append the configured timezone offset so the Node.js server correctly parses it.
            const bdTimeStr = timestampStr.replace(' ', 'T') + config.deviceTimezoneOffset;
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
            WebhookService.queueWebhook('raw_attendance', log);

            // --- LIVE CALCULATION ---
            // Trigger calculation asynchronously for Today and Yesterday
            // We do Yesterday to safely catch punches belonging to night-shifts
            const todayStr = punchTimeDate.toISOString().split('T')[0];
            const yesterdayDate = new Date(punchTimeDate);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

            AttendanceCalculationService.calculateLiveForEmployee(uid, todayStr).catch(e => 
              logger.error(`[LiveCalc] Error for ${uid} on ${todayStr}`, { error: e.message })
            );
            AttendanceCalculationService.calculateLiveForEmployee(uid, yesterdayStr).catch(e => 
              logger.error(`[LiveCalc] Error for ${uid} on ${yesterdayStr}`, { error: e.message })
            );

          } catch (e) {
            logger.error(`[Push] Failed to save attendance`, { error: (e as Error).message });
            dbHasError = true;
          }
        }
      }
    }
  }

  // Parse OPERLOG (Settings / User Updates made on the device itself)
  if (table === 'OPERLOG' && typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // Format: OPLOG OpType Param1 Time Param2 Param3 Param4
      // Example: OPLOG 4\t1\t2026-07-16 20:16:37\t1\t0\t0\t0
      const match = line.match(/^OPLOG\s+(\d+)\t[^\t]+\t[^\t]+\t(\d+)/);
      if (match && sn) {
        const opType = parseInt(match[1], 10);
        const uid = match[2];
        
        // opType 1: add user, 4: update user
        // This usually means a Card, Name, or Privilege was changed on the hardware.
        if ([1, 4].includes(opType) && uid) {
          try {
            await prisma.commandQueue.create({
              data: {
                deviceSn: sn,
                commandType: 'QUERY_USER',
                commandData: `DATA QUERY USERINFO PIN=${uid}`,
                status: 'pending',
              }
            });
            logger.info(`[Push] Device ${sn} updated User ${uid}. Queued QUERY command to fetch new Card/Name.`);
          } catch(e) {
            logger.error(`[Push] Failed to queue QUERY_USER`, { error: (e as Error).message });
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
      let card = '';

      if (line.includes('PIN=')) {
        // Key-Value format
        parts.forEach(p => {
          if (p.startsWith('PIN=')) uidStr = p.replace('PIN=', '');
          if (p.startsWith('Name=')) name = p.replace('Name=', '');
          if (p.startsWith('Pri=')) privilege = parseInt(p.replace('Pri=', ''), 10);
          if (p.startsWith('Card=')) card = p.replace('Card=', '');
        });
      } else if (parts.length >= 2) {
        // TSV format
        uidStr = parts[0];
        name = parts[1];
        privilege = parts.length > 2 ? parseInt(parts[2], 10) : 0;
        card = parts.length > 3 ? parts[3] : '';
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
              cardNumber: card || null,
              status: 'active',
              areaId: sourceDevice?.areaId || null,
            },
            update: {
              name: name || `User ${uid}`,
              privilege: isNaN(privilege) ? 0 : privilege,
              cardNumber: card || null,
              status: 'active',
            }
          });
          logger.info(`[Push] Synced user UID: ${uid}, Name: ${name}`);
          
          // Trigger Webhook
          WebhookService.queueWebhook('user_synced_from_device', { deviceSn: sn, user });

          // Broadcast to ALL OTHER connected devices in the same Area
          const targetDevices = await prisma.device.findMany({ 
            where: { 
              serialNumber: { not: sn },
              areaId: user.areaId
            } 
          });
          
          for (const device of targetDevices) {
            // Track sync state
            await prisma.userDevice.upsert({
              where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
              create: { userId: user.id, deviceId: device.id, syncedAt: null },
              update: { syncedAt: null }
            });

            const cmdData = `DATA UPDATE USERINFO PIN=${uid} Name=${name} Pri=${user.privilege}${card ? ` Card=${card}` : ''}`;
            await prisma.commandQueue.create({
              data: {
                deviceSn: device.serialNumber,
                commandType: 'UPDATE_USERINFO',
                commandData: cmdData,
                status: 'pending',
              }
            });
          }
        } catch (e) {
          logger.error(`[Push] Failed to sync user`, { error: (e as Error).message });
          dbHasError = true;
        }
      }
    }
  }

  // Parse FP (Fingerprint) or FACE (Face) or BIODATA or TEMPLATE
  if ((table === 'FP' || table === 'FACE' || table === 'BIODATA' || table === 'TEMPLATE') && typeof rawBody === 'string') {
    const lines = rawBody.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      // Key-Value format: PIN=1001 FID=0 Size=250 Valid=1 TMP=...
      // Or BIODATA format: BIODATA Pin=1001 No=0 Valid=1 Type=1 Tmp=...
      const parts = line.split('\t');
      let uidStr = '';
      let fidStr = '0';
      let sizeStr = '0';
      let validStr = '1';
      let tmp = '';
      let typeCode = table === 'FACE' ? 15 : 1; // 1 = Finger, 15 = Face

      parts.forEach(p => {
        const part = p.trim();
        // Handle normal FP/FACE
        if (part.startsWith('PIN=')) uidStr = part.replace('PIN=', '');
        if (part.startsWith('FID=')) fidStr = part.replace('FID=', '');
        if (part.startsWith('Size=')) sizeStr = part.replace('Size=', '');
        if (part.startsWith('Valid=')) validStr = part.replace('Valid=', '');
        if (part.startsWith('TMP=')) tmp = part.replace('TMP=', '');

        // Handle BIODATA
        if (part.toUpperCase().startsWith('BIODATA PIN=')) uidStr = part.substring(12);
        if (part.startsWith('Pin=')) uidStr = part.replace('Pin=', '');
        if (part.startsWith('No=')) fidStr = part.replace('No=', '');
        if (part.startsWith('Tmp=')) tmp = part.replace('Tmp=', '');
        if (part.startsWith('Type=')) {
          const t = parseInt(part.replace('Type=', ''), 10);
          // Type=1 is Finger, Type=2/8/9 are usually Face. 
          typeCode = t === 1 ? 1 : 15;
        }
      });

      const uid = parseInt(uidStr, 10);
      if (!isNaN(uid) && tmp) {
        try {
          // ENSURE USER EXISTS (Prevent Foreign Key Error if fingerprint arrives before user profile)
          await prisma.user.upsert({
            where: { uid: uid },
            create: {
              uid: uid,
              name: `User ${uid}`,
              status: 'active',
              areaId: sourceDevice?.areaId || null,
            },
            update: {} // Do nothing if user already exists
          });

          const bioTemplate = await prisma.biometricTemplate.upsert({
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

          // Find the user to get their Area
          const user = await prisma.user.findUnique({ where: { uid: uid } });
          if (user) {
            // Broadcast to ALL OTHER devices in the same Area
            const targetDevices = await prisma.device.findMany({ 
              where: { 
                serialNumber: { not: sn },
                areaId: user.areaId
              } 
            });
            
            for (const device of targetDevices) {
              // Track sync state
              await prisma.userDevice.upsert({
                where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
                create: { userId: user.id, deviceId: device.id, syncedAt: null },
                update: { syncedAt: null }
              });

              let cmdData = '';
              if (line.toUpperCase().startsWith('BIODATA ')) {
                // If the device uses the BIODATA table, it requires all exact formatting (MajorVer, MinorVer, etc.)
                cmdData = `DATA UPDATE ${line.trim()}`;
              } else {
                // Legacy fallback for FP/FACE
                const cmdPrefix = typeCode === 15 ? 'DATA UPDATE FACE' : 'DATA UPDATE FINGERTMP';
                cmdData = `${cmdPrefix} PIN=${uidStr} FID=${fidStr} Size=${sizeStr} Valid=${validStr} TMP=${tmp}`;
              }
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
  
  // Noisy getrequest logs are disabled
  // logger.info(`[Push] Device Polling (getrequest) from SN: ${sn || 'UNKNOWN'}`);
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
  logger.info(`[Push Raw Data CMD] \n${typeof rawBody === 'object' ? JSON.stringify(rawBody, null, 2) : rawBody}`);
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
                const uid = parseInt(pinMatch[1], 10);
                await prisma.user.updateMany({
                  where: { uid: uid },
                  data: { status: 'active' }
                });

                // Update UserDevice syncedAt
                const user = await prisma.user.findUnique({ where: { uid: uid } });
                const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
                if (user && device) {
                  await prisma.userDevice.upsert({
                    where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
                    create: { userId: user.id, deviceId: device.id, syncedAt: new Date() },
                    update: { syncedAt: new Date() }
                  });
                  logger.info(`[Sync] User ${uid} successfully synced to device ${sn}`);
                }
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
              const uid = parseInt(pinMatch[1], 10);
              await prisma.user.updateMany({
                where: { uid: uid },
                data: { status: 'active' }
              });

              // Update UserDevice syncedAt
              const user = await prisma.user.findUnique({ where: { uid: uid } });
              const device = await prisma.device.findUnique({ where: { serialNumber: sn } });
              if (user && device) {
                await prisma.userDevice.upsert({
                  where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
                  create: { userId: user.id, deviceId: device.id, syncedAt: new Date() },
                  update: { syncedAt: new Date() }
                });
                logger.info(`[Sync] User ${uid} successfully synced to device ${sn}`);
              }
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
