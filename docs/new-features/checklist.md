# Attendance Calculation Engine — Implementation Checklist

> Follow this list in order. Each phase depends on the previous one.
> Mark items as `[x]` when done, `[/]` when in progress.
> Reference: [plan.md](./plan.md) for full design details.

---

## Phase 1: Database Schema & Migration

**Goal:** Add the 4 new tables and modify AttendanceLog.

### 1.1 Schema Updates
- [ ] Add `ShiftTimetable` model to `prisma/schema.prisma`
  - All minute-offset fields (shiftStart, shiftEnd, checkIn/Out windows)
  - graceMinutes, overtimeThresholdMinutes, breakMinutes defaults
  - isActive soft-delete flag
- [ ] Add `EmployeeSchedule` model to `prisma/schema.prisma`
  - FK to ShiftTimetable
  - Unique constraint on `(employeeId, scheduleDate)`
- [ ] Add `DailyAttendanceReport` model to `prisma/schema.prisma`
  - All calculated fields (workingMinutes, lateMinutes, overtimeMinutes, etc.)
  - Manual override fields (isManualOverride, manualOvertimeMinutes, manualNote)
  - Unique constraint on `(employeeId, scheduleDate)`
  - Status as String enum
- [ ] Add `SystemConfig` model to `prisma/schema.prisma`
  - key/value pattern with unique key constraint
- [ ] Add `isDuplicate` Boolean field to existing `AttendanceLog` model (default: false)
- [ ] Add `isDuplicate` to the AttendanceLog index for query performance

### 1.2 Migration
- [ ] Run `npx prisma migrate dev --name add_attendance_engine`
- [ ] Run `npx prisma generate`
- [ ] Verify all new tables exist in the database
- [ ] Verify existing AttendanceLog data is preserved with `isDuplicate = false`

---

## Phase 2: Configuration Service

**Goal:** Build the config service so other services can read dynamic settings.

### 2.1 Config Service
- [ ] Create `src/services/configService.ts`
  - `getConfig(key): string | null` — fetch config value by key
  - `getConfigNumber(key, defaultValue): number` — fetch with number coercion
  - `getConfigBoolean(key, defaultValue): boolean` — fetch with boolean coercion
  - `setConfig(key, value, description?)` — upsert a config entry
  - `getAllConfigs()` — return all config entries
  - `seedDefaults()` — insert default configs if table is empty

### 2.2 Config API Routes
- [ ] Create `src/api/routes/configs.ts`
  - `GET /api/v1/configs` — list all configs
  - `GET /api/v1/configs/:key` — get single config
  - `PUT /api/v1/configs/:key` — update config value (body: `{ value, description? }`)

### 2.3 Config Seeding
- [ ] Add `seedDefaults()` call in `src/index.ts` during server startup
- [ ] Default entries to seed:
  - `duplicate_threshold_minutes` = `3`
  - `calculation_cron` = `0 2 * * *`
  - `auto_mark_absent` = `true`

### 2.4 Timezone Constant
- [ ] Add `timezone: 'Asia/Dhaka'` to `src/config/index.ts`
- [ ] Export and use this constant in all date operations

### 2.5 Register Config Routes
- [ ] Add `import configRoutes from './api/routes/configs'` to `src/app.ts`
- [ ] Mount at `/api/v1/configs`

### 2.6 Test
- [ ] Verify `GET /api/v1/configs` returns seeded defaults
- [ ] Verify `PUT /api/v1/configs/duplicate_threshold_minutes` updates value
- [ ] Verify server starts without errors

---

## Phase 3: Shift Timetable Management

**Goal:** Build CRUD for shift timetables.

### 3.1 Shift Service
- [ ] Create `src/services/shiftService.ts`
  - `createShift(data)` — validate offsets + create
  - `updateShift(id, data)` — validate + update
  - `deleteShift(id)` — soft delete (set isActive = false)
  - `getShift(id)` — fetch single with human-readable times
  - `getAllShifts()` — fetch all active shifts
  - `offsetToTimeString(offset)` — convert 480 → "08:00 AM"
  - `timeStringToOffset(time)` — convert "08:00 AM" → 480
  - Validation: checkInStart < checkInEnd, checkOutStart < checkOutEnd
  - Validation: checkInEnd < checkOutStart (no window overlap)

### 3.2 Shift API Routes
- [ ] Create `src/api/routes/shifts.ts`
  - `GET /api/v1/shifts` — list all active shifts
  - `GET /api/v1/shifts/:id` — get single shift (include human-readable times)
  - `POST /api/v1/shifts` — create shift (validate offsets)
  - `PUT /api/v1/shifts/:id` — update shift
  - `DELETE /api/v1/shifts/:id` — soft delete

### 3.3 Register Shift Routes
- [ ] Add `import shiftRoutes from './api/routes/shifts'` to `src/app.ts`
- [ ] Mount at `/api/v1/shifts`

### 3.4 Test
- [ ] Create a "Day Shift" (7 AM–11 AM in, 4 PM–10 PM out, shift 8 AM–5 PM)
- [ ] Create a "Night Shift" (6 PM–12 AM in, 5 AM–12 PM out, shift 8 PM–8 AM)
- [ ] Verify offset-to-time conversion is correct
- [ ] Verify invalid offset combinations are rejected

---

## Phase 4: Employee Schedule Management

**Goal:** Build the roster assignment system.

### 4.1 Schedule Service
- [ ] Create `src/services/scheduleService.ts`
  - `assignSchedule(employeeId, employeeDeviceUid, timetableId, scheduleDate)` — single assignment
  - `bulkAssignSchedule(employeeIds[], employeeDeviceUids[], timetableId, dateFrom, dateTo)` — bulk assignment for date range
  - `removeSchedule(id)` — delete assignment
  - `getSchedules(filters)` — query with date, employeeId, dateFrom/dateTo filters
  - Conflict detection: throw error if employee already has a schedule on that date

### 4.2 Schedule API Routes
- [ ] Create `src/api/routes/schedules.ts`
  - `GET /api/v1/schedules` — list schedules (query params: date, employeeId, dateFrom, dateTo)
  - `POST /api/v1/schedules` — assign single schedule
  - `POST /api/v1/schedules/bulk` — bulk assign
  - `DELETE /api/v1/schedules/:id` — remove assignment

### 4.3 Register Schedule Routes
- [ ] Add `import scheduleRoutes from './api/routes/schedules'` to `src/app.ts`
- [ ] Mount at `/api/v1/schedules`

### 4.4 Test
- [ ] Assign employee UID 1 to "Day Shift" for July 14
- [ ] Verify duplicate assignment on same date is rejected
- [ ] Bulk assign UIDs 1,2,3 to "Night Shift" for July 15–20
- [ ] Verify all 18 schedule records are created (3 employees × 6 days)
- [ ] Verify `GET /api/v1/schedules?date=2026-07-15` returns correct data

---

## Phase 5: Duplicate Detection Service

**Goal:** Build the noise reduction filter.

### 5.1 Duplicate Detection Service
- [ ] Create `src/services/duplicateDetectionService.ts`
  - `filterDuplicates(date)` — main function:
    1. Read `duplicate_threshold_minutes` from SystemConfig
    2. Query all raw logs for the date range (considering cross-midnight shifts need wider range)
    3. Group by `uid`, sort by `punchTime`
    4. For sequential same-UID punches within threshold, mark `isDuplicate = true` on the later one
    5. Preserve the first punch, mark subsequent duplicates
  - `resetDuplicates(date)` — reset all `isDuplicate` flags for a date (useful for re-processing)

### 5.2 Test
- [ ] Insert test punches: UID 1 at 8:00, 8:01, 8:02 (within 3-min threshold)
- [ ] Run `filterDuplicates` for that date
- [ ] Verify only 8:00 has `isDuplicate = false`, others are `true`
- [ ] Verify raw data is NOT deleted

---

## Phase 6: Attendance Calculation Engine ⭐

**Goal:** Build the core window-based calculation engine.

### 6.1 Calculation Service
- [ ] Create `src/services/attendanceCalculationService.ts`
- [ ] Implement `offsetToAbsoluteTime(scheduleDate, offsetMinutes)`:
  - Anchor on scheduleDate midnight in Asia/Dhaka
  - Add offsetMinutes to get absolute DateTime
- [ ] Implement `classifyPunches(logs, checkInWindow, checkOutWindow)`:
  - Sort logs by punchTime
  - Classify into checkInCandidates, checkOutCandidates, middlePunches
  - Return classified arrays
- [ ] Implement `calculateForEmployee(schedule, timetable, rawLogs)` (pure function):
  - Build absolute windows from offsets
  - Classify punches
  - Select earliest check-in, latest check-out
  - Run parity check on middle punches
  - Calculate working, late, early leave, overtime minutes
  - Determine status (PRESENT, LATE, EARLY_LEAVE, ABSENT, MISSING_PUNCH, EXCEPTION)
  - Return structured report object
- [ ] Implement `calculateForDate(date)`:
  - Fetch all EmployeeSchedules for the date (include timetable)
  - For each schedule, query non-duplicate raw logs within window range
  - Call `calculateForEmployee` for each
  - Upsert results into DailyAttendanceReport (skip if isManualOverride = true)
  - Return count of processed records
- [ ] Implement `markAbsentees(date)`:
  - Find schedules with no matching raw logs at all
  - Create DailyAttendanceReport with status = ABSENT
- [ ] Handle edge case: cross-midnight shifts (offsets > 1440 create next-day timestamps)
- [ ] Handle edge case: employee has punches but all outside windows → EXCEPTION status

### 6.2 Test Scenarios
- [ ] **Normal Day Shift**: Punch at 7:55 AM and 5:10 PM → PRESENT, 0 late, 10 min OT
- [ ] **Late Arrival**: Punch at 8:30 AM → LATE, lateMinutes = 15 (30 - 15 grace)
- [ ] **Early Leave**: Punch at 3:45 PM → EARLY_LEAVE, earlyLeave = 75 min
- [ ] **Missing Check-Out**: Only punch at 8:00 AM → MISSING_PUNCH
- [ ] **Missing Check-In**: Only punch at 5:00 PM → MISSING_PUNCH
- [ ] **Wrong Punch (Odd Middle)**: Punches at 8:00, 12:00, 5:00 → MISSING_PUNCH (1 middle punch = odd)
- [ ] **Clean Break**: Punches at 8:00, 12:00, 12:30, 5:00 → PRESENT (2 middle punches = even)
- [ ] **No Punches**: Employee scheduled but no logs → ABSENT
- [ ] **Cross-Midnight Shift**: Night shift 8 PM–8 AM, punches at 7:50 PM and 8:10 AM → PRESENT
- [ ] **Duplicate Ignored**: 3 rapid punches → only first counted after de-dup
- [ ] **Manual Override Protected**: Existing override record not overwritten by cron

---

## Phase 7: Reports API

**Goal:** Expose the calculated reports and admin override.

### 7.1 Reports API Routes
- [ ] Create `src/api/routes/reports.ts`
  - `GET /api/v1/reports/daily` — query daily reports
    - Filters: `date`, `dateFrom`, `dateTo`, `employeeId`, `status`
    - Include shift timetable name in response
  - `GET /api/v1/reports/summary` — monthly/range summary
    - Query params: `employeeId`, `dateFrom`, `dateTo`
    - Returns: totalPresentDays, totalAbsentDays, totalLateDays, totalLateMinutes, totalOvertimeMinutes, totalWorkingMinutes, totalManualOvertimeMinutes
  - `POST /api/v1/reports/calculate` — manually trigger calculation
    - Body: `{ date }` (ISO date string)
    - Runs duplicate filter + calculation engine + absentee marking
    - Returns processed count
  - `PUT /api/v1/reports/:id/override` — manual override
    - Body: `{ status?, workingMinutes?, overtimeMinutes?, manualOvertimeMinutes?, manualNote? }`
    - Sets `isManualOverride = true`

### 7.2 Register Report Routes
- [ ] Add `import reportRoutes from './api/routes/reports'` to `src/app.ts`
- [ ] Mount at `/api/v1/reports`

### 7.3 Test
- [ ] Trigger manual calculation via `POST /api/v1/reports/calculate`
- [ ] Verify `GET /api/v1/reports/daily?date=2026-07-14` returns calculated reports
- [ ] Verify `GET /api/v1/reports/summary?dateFrom=2026-07-01&dateTo=2026-07-31` returns aggregates
- [ ] Override a record with manual OT and verify `isManualOverride = true`
- [ ] Re-run calculation and verify overridden record is NOT changed

---

## Phase 8: Background Worker & Webhooks

**Goal:** Automate the calculation engine via cron.

### 8.1 Attendance Worker
- [ ] Create `src/scheduler/attendanceWorker.ts`
  - Read `calculation_cron` from SystemConfig on startup
  - Schedule cron job using `node-cron`
  - On trigger:
    1. Determine target date (yesterday for 2 AM runs)
    2. Log start of calculation
    3. Run `DuplicateDetectionService.filterDuplicates(targetDate)`
    4. Run `AttendanceCalculationService.calculateForDate(targetDate)`
    5. Run `AttendanceCalculationService.markAbsentees(targetDate)`
    6. Log completion with counts
  - Handle errors gracefully (log but don't crash)

### 8.2 Webhook Integration
- [ ] After calculation, queue `attendance.calculated` webhook for each processed report
  - Payload: `{ event, employeeId, date, status, workingMinutes, lateMinutes, overtimeMinutes }`
- [ ] Use existing `WebhookService.queueWebhook()` method

### 8.3 Server Integration
- [ ] Import and start attendance worker in `src/index.ts`
- [ ] Log cron schedule on startup (e.g., "Attendance worker scheduled: 0 2 * * *")
- [ ] Delete `src/scheduler/.gitkeep`

### 8.4 Test
- [ ] Verify cron starts on server boot with correct schedule
- [ ] Manually trigger via API and verify webhooks are queued
- [ ] Change cron via config API and verify new schedule takes effect after restart

---

## Phase 9: Enhanced Raw Attendance API

**Goal:** Improve the existing raw logs endpoint.

### 9.1 Modify Attendance Route
- [ ] Update `src/api/routes/attendance.ts`:
  - Add `uid` filter (query param)
  - Add `dateFrom` / `dateTo` filter (date range query)
  - Add `excludeDuplicates` boolean query param (default: false)
  - Keep existing `sn` and `limit` filters

### 9.2 Test
- [ ] `GET /api/v1/attendance?uid=1&dateFrom=2026-07-14&dateTo=2026-07-14` works
- [ ] `GET /api/v1/attendance?excludeDuplicates=true` hides duplicate-marked logs

---

## Phase 10: Final Integration & Verification

**Goal:** Full end-to-end testing.

### 10.1 Build Verification
- [ ] Run `npm run build` — verify zero TypeScript errors
- [ ] Run `npx prisma generate` — verify client is up to date

### 10.2 End-to-End Test Flow
- [ ] Step 1: Create a "Day Shift" via `POST /api/v1/shifts`
- [ ] Step 2: Set duplicate threshold via `PUT /api/v1/configs/duplicate_threshold_minutes`
- [ ] Step 3: Assign employee schedules via `POST /api/v1/schedules/bulk`
- [ ] Step 4: Raw punches flow in from device (or manually insert test data)
- [ ] Step 5: Trigger `POST /api/v1/reports/calculate` with target date
- [ ] Step 6: Verify `GET /api/v1/reports/daily` returns correct calculations
- [ ] Step 7: Verify `GET /api/v1/reports/summary` returns correct monthly totals
- [ ] Step 8: Override one report with manual OT and verify persistence
- [ ] Step 9: Re-run calculation and verify override is protected
- [ ] Step 10: Verify webhook payloads are queued in webhook_queue table

### 10.3 Edge Cases to Verify
- [ ] Cross-midnight night shift produces correct report
- [ ] Employee with no schedule → no report generated (not marked absent)
- [ ] Employee with schedule but no punches → ABSENT
- [ ] Rapid duplicate punches → filtered out correctly
- [ ] Odd middle punch → MISSING_PUNCH with anomaly notes
- [ ] Extreme OT beyond window → not auto-calculated, requires manual override
