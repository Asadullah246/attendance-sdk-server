import { PrismaClient } from '@prisma/client';
import { AttendanceCalculationService } from '../src/services/attendanceCalculationService';
import { DuplicateDetectionService } from '../src/services/duplicateDetectionService';

const prisma = new PrismaClient();

function setTime(date: Date, hours: number, minutes: number): Date {
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
}

async function main() {
  console.log('🌱 Starting dummy data seeding...');

  const UIDs = [101, 102, 103, 104, 105, 106];

  // 1. Cleanup old data
  console.log('Cleaning up old test users and their logs...');
  await prisma.attendanceLog.deleteMany({
    where: { uid: { in: UIDs } }
  });
  await prisma.employeeSchedule.deleteMany({
    where: { uid: { in: UIDs } }
  });
  await prisma.dailyAttendanceReport.deleteMany({
    where: { uid: { in: UIDs } }
  });
  await prisma.user.deleteMany({
    where: { uid: { in: UIDs } }
  });
  
  // Cleanup old dummy shifts
  await prisma.shiftTimetable.deleteMany({
    where: { name: 'Standard Dummy Shift' }
  });

  // 2. Create the Shift
  console.log('Creating Standard Dummy Shift...');
  const shift = await prisma.shiftTimetable.create({
    data: {
      name: 'Standard Dummy Shift',
      shiftStartOffset: 9 * 60, // 09:00
      shiftEndOffset: 17 * 60, // 17:00
      checkInStartOffset: 7 * 60, // 07:00
      checkInEndOffset: 11 * 60, // 11:00
      checkOutStartOffset: 15 * 60, // 15:00
      checkOutEndOffset: 22 * 60, // 22:00
      graceMinutes: 15,
      overtimeThresholdMinutes: 30,
      breakMinutes: 0
    }
  });

  // 3. Create Users
  console.log('Creating Test Personas...');
  const users = [
    { uid: 101, name: 'Perfect Peter (On Time)' },
    { uid: 102, name: 'Late Larry (Late & OT)' },
    { uid: 103, name: 'Absent Alice (No Punches)' },
    { uid: 104, name: 'Duplicate Dan (Spam Punches)' },
    { uid: 105, name: 'Out-of-range Olivia (Invalid Times)' },
    { uid: 106, name: 'Single-punch Steve (No Check-out)' },
  ];

  for (const u of users) {
    await prisma.user.create({
      data: {
        uid: u.uid,
        name: u.name,
        privilege: 0,
        status: 'active'
      }
    });
  }

  // 4. Generate data for the last 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const deviceSn = 'DUMMY_DEV_01';

  await prisma.device.upsert({
    where: { serialNumber: deviceSn },
    update: { isOnline: true },
    create: {
      serialNumber: deviceSn,
      name: 'Dummy Device',
      isOnline: true
    }
  });

  console.log('Generating Schedules and Punches for the last 7 days...');

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);

    for (const u of users) {
      // Create Schedule
      await prisma.employeeSchedule.create({
        data: {
          uid: u.uid,
          timetableId: shift.id,
          scheduleDate: targetDate
        }
      });

      const generatePunch = async (hours: number, minutes: number) => {
        await prisma.attendanceLog.create({
          data: {
            deviceSn,
            uid: u.uid,
            punchTime: setTime(targetDate, hours, minutes),
            verifyType: 1, // Fingerprint
            source: 'push'
          }
        });
      };

      // Generate Punches based on Persona
      if (u.uid === 101) {
        await generatePunch(8, 50);
        await generatePunch(17, 10);
      } 
      else if (u.uid === 102) {
        await generatePunch(9, 30);
        await generatePunch(18, 30);
      }
      else if (u.uid === 103) {
        // No punches
      }
      else if (u.uid === 104) {
        await generatePunch(8, 50);
        await generatePunch(8, 51);
        await generatePunch(8, 52);
        
        await generatePunch(17, 10);
        await generatePunch(17, 11);
        await generatePunch(17, 12);
      }
      else if (u.uid === 105) {
        await generatePunch(13, 0);
        await generatePunch(23, 30);
      }
      else if (u.uid === 106) {
        await generatePunch(8, 50);
      }
    }

    // Trigger calculation for this specific date
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    console.log(`Calculating attendance for ${dateString}...`);
    await DuplicateDetectionService.filterDuplicates(dateString);
    await AttendanceCalculationService.calculateForDate(dateString);
    await AttendanceCalculationService.markAbsentees(dateString);
  }

  console.log('✅ Seeding and calculation completed successfully!');
}

main()
  .catch(e => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
