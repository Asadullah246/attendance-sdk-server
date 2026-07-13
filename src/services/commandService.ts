import { getPrisma } from '../database/prisma';
import logger from '../utils/logger';

const prisma = getPrisma();

export class CommandService {
  /**
   * Helper to insert a command into the queue
   */
  private static async enqueue(sn: string, commandType: string, commandString: string) {
    try {
      const command = await prisma.commandQueue.create({
        data: {
          deviceSn: sn,
          commandType,
          commandData: commandString,
          status: 'pending',
        },
      });
      logger.info(`[CommandService] Queued command ${command.id} for device ${sn}: ${commandString}`);
      return { success: true, commandId: command.id };
    } catch (error) {
      logger.error(`[CommandService] Failed to queue command for ${sn}`, {
        error: (error as Error).message,
        command: commandString,
      });
      throw new Error(`Failed to queue command: ${(error as Error).message}`);
    }
  }

  /**
   * Reboots the device
   */
  static async rebootDevice(sn: string) {
    // ADMS format for reboot
    return this.enqueue(sn, 'reboot', 'REBOOT');
  }

  /**
   * Unlocks the door/turnstile connected to the device
   */
  static async unlockDoor(sn: string) {
    // ADMS format for unlock
    return this.enqueue(sn, 'unlock', 'AC_UNLOCK');
  }

  /**
   * Clears all attendance logs on the device
   */
  static async clearAttendanceLogs(sn: string) {
    return this.enqueue(sn, 'clear_log', 'CLEAR LOG');
  }
  
  /**
   * Syncs the device time to the server's current time
   */
  static async syncTime(sn: string) {
    const now = new Date();
    // Format: YYYY-MM-DD HH:MM:SS
    const timeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    return this.enqueue(sn, 'sync_time', `DATA UPDATE SETTING Time=${timeStr}`);
  }

  /**
   * Adds or updates a user on the device
   */
  static async addUser(sn: string, uid: number, name: string, privilege: number = 0, password?: string) {
    // Basic ADMS format: DATA UPDATE USERINFO PIN=1\tName=John\tPri=0
    let commandStr = `DATA UPDATE USERINFO PIN=${uid}\tName=${name}\tPri=${privilege}`;
    if (password) {
      commandStr += `\tPass=${password}`;
    }
    return this.enqueue(sn, 'add_user', commandStr);
  }

  /**
   * Deletes a user from the device
   */
  static async deleteUser(sn: string, uid: number) {
    return this.enqueue(sn, 'delete_user', `DATA DELETE USERINFO PIN=${uid}`);
  }

  /**
   * Gets the status of a specific command
   */
  static async getCommandStatus(commandId: number) {
    return prisma.commandQueue.findUnique({
      where: { id: commandId },
    });
  }
}
