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
  
  // 2. Create or Update the Shift
  console.log('Creating Standard Dummy Shift...');
  let shift = await prisma.shiftTimetable.findFirst({
    where: { name: 'Standard Dummy Shift' }
  });

  const shiftData = {
      name: 'Standard Dummy Shift',
      checkInStartOffset: 7 * 60, // 7am
      shiftStartOffset: 8 * 60,   // 8am
      shiftEndOffset: 17 * 60,    // 5pm
      checkOutEndOffset: 22 * 60, // 10pm
      breakMinutes: 60,
      graceMinutes: 20,
      overtimeThresholdMinutes: 60,
      
      // Add missing fields
      checkInEndOffset: 10 * 60,
      checkOutStartOffset: 16 * 60,
  };

  if (shift) {
    shift = await prisma.shiftTimetable.update({
      where: { id: shift.id },
      data: shiftData
    });
  } else {
    shift = await prisma.shiftTimetable.create({
      data: shiftData
    });
  }

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
    const targetDateLocal = new Date(today);
    targetDateLocal.setDate(today.getDate() - i);
    
    // Create UTC midnight for DB @db.Date fields
    const year = targetDateLocal.getFullYear();
    const month = String(targetDateLocal.getMonth() + 1).padStart(2, '0');
    const day = String(targetDateLocal.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const targetDateUTC = new Date(`${dateString}T00:00:00.000Z`);

    for (const u of users) {
      // Create Schedule
      await prisma.employeeSchedule.create({
        data: {
          uid: u.uid,
          timetableId: shift.id,
          scheduleDate: targetDateUTC
        }
      });

      const generatePunch = async (hours: number, minutes: number) => {
        // Punches are still local time, so we use targetDateLocal
        const d = new Date(targetDateLocal);
        d.setHours(hours, minutes, 0, 0);
        await prisma.attendanceLog.create({
          data: {
            deviceSn,
            uid: u.uid,
            punchTime: d,
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
