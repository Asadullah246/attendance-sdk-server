declare module 'zkteco-js' {
  class ZKTeco {
    constructor(ip: string, port: number, timeout?: number, inport?: number);

    createSocket(): Promise<boolean>;
    disconnect(): Promise<boolean>;

    // Device info
    getInfo(): Promise<Record<string, unknown>>;

    // Users
    getUsers(): Promise<{ data: Array<Record<string, unknown>> }>;
    setUser(
      uid: number,
      userid: string,
      name: string,
      password: string,
      role: number,
      cardno: number
    ): Promise<boolean>;
    deleteUser(uid: number): Promise<boolean>;

    // Attendance
    getAttendances(): Promise<{ data: Array<Record<string, unknown>> }>;
    clearAttendanceLog(): Promise<boolean>;

    // Templates
    getTemplates(): Promise<{ data: Array<Record<string, unknown>> }>;

    // Device commands
    setTime(date: Date): Promise<boolean>;
    getTime(): Promise<Date>;
    reboot(): Promise<boolean>;
    powerOff(): Promise<boolean>;

    // Real-time
    getRealTimeLogs(callback: (data: Record<string, unknown>) => void): Promise<void>;
  }

  export = ZKTeco;
}
