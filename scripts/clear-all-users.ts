import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️ Starting complete user wipe...');

  // Delete all attendance logs first (foreign key constraint)
  const logs = await prisma.attendanceLog.deleteMany();
  console.log(`✅ Deleted ${logs.count} attendance logs.`);

  // Delete all schedules
  const schedules = await prisma.employeeSchedule.deleteMany();
  console.log(`✅ Deleted ${schedules.count} schedules.`);
  
  // Delete all daily reports
  const reports = await prisma.dailyAttendanceReport.deleteMany();
  console.log(`✅ Deleted ${reports.count} daily reports.`);

  // Delete all biometric templates
  const templates = await prisma.biometricTemplate.deleteMany();
  console.log(`✅ Deleted ${templates.count} biometric templates.`);

  // Delete user-device assignments
  const userDevices = await prisma.userDevice.deleteMany();
  console.log(`✅ Deleted ${userDevices.count} user-device links.`);

  // Finally, delete all users
  const users = await prisma.user.deleteMany();
  console.log(`✅ Deleted ${users.count} users.`);

  console.log('🎉 SDK Database successfully cleared of all users!');
  console.log('You can now run Bulk Sync from the frontend to securely add everyone back.');
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
