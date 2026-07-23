# Attendance Calculation Engine — Implementation Plan

> **Goal:** Transform the SDK server from a raw punch ingestion layer into a complete attendance calculation microservice with shift management, scheduling, duplicate detection, wrong punch detection, and daily report generation.
>
> This is designed for a **single-company deployment** (e.g., one hospital or one school). Multi-tenant support can be added later.

---

## 1. Design Decisions

### 1.1 Timezone Handling
- Use **Bangladesh Standard Time (BST / +06:00)** statically.
- Define the timezone string in **one central place**: `src/config/index.ts` as `TIMEZONE = 'Asia/Dhaka'`.
- All date/time calculations in the engine will reference this constant.
- To change timezone later (or make it dynamic), only this one place needs updating.

### 1.2 Configurable Settings (Config Table)
All tunable parameters are stored in a `SystemConfig` database table and exposed via API:
- **Duplicate punch threshold** (default: 3 minutes)
- **Calculation cron expression** (default: `0 2 * * *` — daily at 2:00 AM)
- **Auto-mark absent** (default: true)
- **Overtime threshold minutes** (default: 30) — minimum OT to count
- **Max auto overtime minutes** (default: 0) — beyond this, admin must manually approve

### 1.3 Shift Window Strategy (The Core Algorithm)
Each shift timetable defines **fixed Check-In and Check-Out time windows**:

```
Example: "Day Shift"
├── Check-In Window:  7:00 AM  →  11:00 AM   (employee must punch IN within this range)
├── Check-Out Window: 4:00 PM  →  10:00 PM   (employee must punch OUT within this range)
├── Shift Start:      8:00 AM               (official start — used for lateness calc)
└── Shift End:        5:00 PM               (official end — used for overtime calc)
```

- **First punch** inside Check-In Window = Official Check-In
- **Last punch** inside Check-Out Window = Official Check-Out
- Punches **between** the two windows = Middle Zone (break tracking / anomaly detection)
- Punches **outside** both windows = Ignored by the engine
- **Extreme overtime** (e.g., employee stays till 11:30 PM or next day 2:00 AM — beyond the Check-Out Window) is **NOT auto-calculated**. Admin manually adjusts via the override API.

### 1.4 Wrong Punch Detection (Parity Check)
Middle-zone punches are evaluated using a **parity check**:

```
EVEN middle punches (e.g., OUT at 1:00 PM, IN at 1:30 PM)
  → Clean break pair. Optionally deduct from working hours.

ODD middle punches (e.g., only OUT at 1:00 PM, no re-entry punch)
  → MISSING_PUNCH anomaly. Flag for HR review.
  → Engine still calculates full hours (Check-In to Check-Out) but marks status.
```

### 1.5 Cross-Midnight Shifts
Shifts that cross midnight (e.g., 8:00 PM → 8:00 AM) are handled using **minute offsets from midnight**:
- `8:00 PM` = offset `1200` (20 hours × 60 minutes)
- `8:00 AM next day` = offset `1920` ((24+8) × 60)
- The engine anchors on the `schedule_date` midnight and adds offsets to create absolute timestamps.

---

## 2. Database Schema (New Tables)

### 2.1 `ShiftTimetable` → `shift_timetables`

Stores shift configurations with fixed In/Out windows using minute-offsets.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | Int (Auto) | PK | Primary key |
| `name` | String | — | e.g., "Day Shift", "Night Shift" |
| `shiftStartOffset` | Int | — | Official start (minutes from midnight). e.g., 480 = 8:00 AM |
| `shiftEndOffset` | Int | — | Official end. e.g., 1020 = 5:00 PM |
| `checkInStartOffset` | Int | — | Earliest valid check-in. e.g., 420 = 7:00 AM |
| `checkInEndOffset` | Int | — | Latest valid check-in. e.g., 660 = 11:00 AM |
| `checkOutStartOffset` | Int | — | Earliest valid check-out. e.g., 960 = 4:00 PM |
| `checkOutEndOffset` | Int | — | Latest valid check-out. e.g., 1320 = 10:00 PM |
| `graceMinutes` | Int | 15 | Lateness grace period |
| `overtimeThresholdMinutes` | Int | 30 | Min OT minutes to count |
| `breakMinutes` | Int | 0 | Standard unpaid break deduction |
| `isActive` | Boolean | true | Soft delete flag |
| `createdAt` | DateTime | now() | — |
| `updatedAt` | DateTime | auto | — |

### 2.2 `EmployeeSchedule` → `employee_schedules`

Maps an employee to a shift on a specific calendar date.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | Int (Auto) | PK | Primary key |
| `employeeId` | String | — | The employee ID from the main app |
| `employeeDeviceUid` | Int | — | The UID registered on the biometric device |
| `timetableId` | Int | FK | References `ShiftTimetable.id` |
| `scheduleDate` | Date | — | Business calendar date |
| `createdAt` | DateTime | now() | — |
| `updatedAt` | DateTime | auto | — |
| **Unique** | | | `(employeeId, scheduleDate)` — one shift per employee per day |

### 2.3 `DailyAttendanceReport` → `daily_attendance_reports`

Final calculated output consumed by payroll / main app.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | Int (Auto) | PK | Primary key |
| `employeeId` | String | — | Employee ID from main app |
| `employeeDeviceUid` | Int | — | Device UID |
| `scheduleDate` | Date | — | Business date |
| `timetableId` | Int | FK | Shift used for calculation |
| `actualCheckIn` | DateTime? | null | First valid punch in Check-In window |
| `actualCheckOut` | DateTime? | null | Last valid punch in Check-Out window |
| `workingMinutes` | Int | 0 | Net calculated working minutes |
| `lateMinutes` | Int | 0 | Minutes late beyond grace |
| `earlyLeaveMinutes` | Int | 0 | Minutes left early |
| `overtimeMinutes` | Int | 0 | Minutes beyond shift end (auto-calculated within window) |
| `breakMinutes` | Int | 0 | Deducted break time |
| `middlePunchCount` | Int | 0 | Number of punches in middle zone |
| `status` | String | — | `PRESENT`, `ABSENT`, `LATE`, `EARLY_LEAVE`, `MISSING_PUNCH`, `HOLIDAY`, `MANUAL` |
| `anomalyNotes` | String? | null | Human-readable anomaly description |
| `isManualOverride` | Boolean | false | Whether HR manually adjusted this record |
| `manualOvertimeMinutes` | Int | 0 | Admin-entered extra OT (for extreme cases beyond the window) |
| `manualNote` | String? | null | Admin's note for the manual override |
| `createdAt` | DateTime | now() | — |
| `updatedAt` | DateTime | auto | — |
| **Unique** | | | `(employeeId, scheduleDate)` — one report per employee per day |

### 2.4 `SystemConfig` → `system_configs`

System-wide configuration for the calculation engine, managed via API.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | Int (Auto) | PK | Primary key |
| `key` | String | Unique | Config key name |
| `value` | String | — | Config value (stored as string, parsed by app) |
| `description` | String? | null | Human-readable description |
| `updatedAt` | DateTime | auto | — |

**Default Config Entries:**

| Key | Default Value | Description |
|-----|---------------|-------------|
| `duplicate_threshold_minutes` | `3` | Ignore duplicate punches within this window |
| `calculation_cron` | `0 2 * * *` | When to run the calculation engine |
| `auto_mark_absent` | `true` | Auto-mark employees with no punches as absent |

### 2.5 Modify Existing `AttendanceLog`

Add one new field:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `isDuplicate` | Boolean | false | Marked by de-duplication filter (preserves raw data) |

---

## 3. New Services

### 3.1 `src/services/shiftService.ts`
- CRUD operations for `ShiftTimetable`
- Validation: ensure `checkInStartOffset < checkInEndOffset` and `checkOutStartOffset < checkOutEndOffset`
- Helper: `offsetToTimeString(offset)` → converts 480 → "08:00 AM" for display
- Helper: `timeStringToOffset(time)` → converts "08:00 AM" → 480

### 3.2 `src/services/scheduleService.ts`
- CRUD for `EmployeeSchedule`
- **Bulk assign**: assign a shift to multiple employees for a date range (e.g., "assign Night Shift to UID 1,2,3 from July 14–31")
- **Conflict detection**: prevent double-scheduling an employee on the same date

### 3.3 `src/services/duplicateDetectionService.ts`
- `filterDuplicates(date)` — Scans `AttendanceLog` for sequential same-UID punches within the configured threshold
- Marks subsequent duplicates with `isDuplicate = true` (never deletes raw data)
- Reads threshold from `SystemConfig` table

### 3.4 `src/services/attendanceCalculationService.ts` ⭐ Core Engine
The most critical new file. Contains the window-based calculation algorithm:

```
calculateForDate(date):
  1. Fetch all EmployeeSchedules for the date
  2. For each schedule:
     a. Build absolute windows from minute offsets + scheduleDate anchor
     b. Query non-duplicate raw logs within the full window range
     c. Classify punches: Check-In candidates, Check-Out candidates, Middle zone
     d. Select: earliest Check-In, latest Check-Out
     e. Parity check on middle punches → detect anomalies
     f. Calculate: workingMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes
     g. Determine status (PRESENT/LATE/ABSENT/MISSING_PUNCH etc.)
     h. Upsert into DailyAttendanceReport (don't overwrite manual overrides)

markAbsentees(date):
  - Find employees with schedules but zero raw punches → mark ABSENT
```

### 3.5 `src/services/configService.ts`
- `getConfig(key)` → fetch a config value with type coercion
- `setConfig(key, value)` → update a config value
- `getAllConfigs()` → return all configs
- `seedDefaults()` → insert default values if table is empty (called on startup)

---

## 4. New API Routes

### 4.1 `src/api/routes/shifts.ts` — Shift Timetable Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/shifts` | List all shift timetables |
| `GET` | `/api/v1/shifts/:id` | Get single shift (with human-readable time display) |
| `POST` | `/api/v1/shifts` | Create a new shift timetable |
| `PUT` | `/api/v1/shifts/:id` | Update a shift timetable |
| `DELETE` | `/api/v1/shifts/:id` | Soft-delete (set `isActive = false`) |

### 4.2 `src/api/routes/schedules.ts` — Employee Schedule Assignment

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/schedules` | List schedules (filter by `date`, `employeeId`, `dateFrom`, `dateTo`) |
| `POST` | `/api/v1/schedules` | Assign an employee to a shift on a date |
| `POST` | `/api/v1/schedules/bulk` | Bulk-assign a shift to multiple employees for a date range |
| `DELETE` | `/api/v1/schedules/:id` | Remove a schedule assignment |

### 4.3 `src/api/routes/reports.ts` — Daily Reports & Summaries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/reports/daily` | Daily attendance reports (filter: `date`, `employeeId`, `status`) |
| `GET` | `/api/v1/reports/summary` | Monthly/range summary per employee |
| `POST` | `/api/v1/reports/calculate` | Manually trigger calculation for a specific date |
| `PUT` | `/api/v1/reports/:id/override` | HR manual override (adjust OT, status, add notes) |

### 4.4 `src/api/routes/configs.ts` — System Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/configs` | Get all system configs |
| `GET` | `/api/v1/configs/:key` | Get a specific config value |
| `PUT` | `/api/v1/configs/:key` | Update a config value |

### 4.5 Modify `src/api/routes/attendance.ts` — Enhanced Raw Logs API

Add more filter options to the existing raw attendance logs endpoint:
- Filter by `uid`, `dateFrom`, `dateTo`
- `excludeDuplicates` query param to hide duplicate-flagged records

---

## 5. Background Worker

### 5.1 `src/scheduler/attendanceWorker.ts`

Uses `node-cron` (already installed) to run the calculation engine automatically.

**Flow:**
1. On startup, read `calculation_cron` from `SystemConfig` (default: `0 2 * * *` = 2:00 AM daily)
2. Schedule the cron job
3. When triggered:
   - Determine target date (yesterday for 2 AM runs)
   - Run `DuplicateDetectionService.filterDuplicates(targetDate)`
   - Run `AttendanceCalculationService.calculateForDate(targetDate)`
   - Run `AttendanceCalculationService.markAbsentees(targetDate)`
   - Queue `attendance.calculated` webhook events for all processed reports

### 5.2 Modify `src/index.ts`

Import and start the attendance worker alongside the existing webhook processor.

### 5.3 Modify `src/app.ts`

Register the 4 new route modules:
```
/api/v1/shifts     → shifts routes
/api/v1/schedules  → schedules routes
/api/v1/reports    → reports routes
/api/v1/configs    → configs routes
```

---

## 6. Calculation Engine — Detailed Algorithm

```
For each EmployeeSchedule on targetDate:
│
├── 1. Build Absolute Windows
│   anchor = scheduleDate at 00:00:00 (midnight) in Asia/Dhaka
│   checkInWindow  = [anchor + checkInStartOffset,  anchor + checkInEndOffset]
│   checkOutWindow = [anchor + checkOutStartOffset, anchor + checkOutEndOffset]
│   shiftStart     = anchor + shiftStartOffset
│   shiftEnd       = anchor + shiftEndOffset
│
├── 2. Query Raw Logs
│   SELECT * FROM attendance_logs
│   WHERE uid = schedule.employeeDeviceUid
│     AND punch_time BETWEEN checkInWindow.start AND checkOutWindow.end
│     AND is_duplicate = false
│   ORDER BY punch_time ASC
│
├── 3. If ZERO logs found → mark ABSENT, continue to next employee
│
├── 4. Classify Each Punch
│   for each log:
│     if (punch_time within Check-In Window)  → checkInCandidates[]
│     if (punch_time within Check-Out Window) → checkOutCandidates[]
│     else                                     → middlePunches[]
│
├── 5. Select Official Punches
│   actualCheckIn  = earliest(checkInCandidates)   — First-In rule
│   actualCheckOut = latest(checkOutCandidates)     — Last-Out rule
│
├── 6. Wrong Punch / Anomaly Detection
│   if (!actualCheckIn && !actualCheckOut)
│     → status = EXCEPTION, note = "Punches exist but outside all windows"
│   if (actualCheckIn && !actualCheckOut)
│     → status = MISSING_PUNCH, note = "Missing check-out"
│   if (!actualCheckIn && actualCheckOut)
│     → status = MISSING_PUNCH, note = "Missing check-in"
│   if (middlePunches.length is ODD)
│     → add anomaly flag, note = "Odd middle punch at HH:MM — missing paired punch"
│
├── 7. Time Calculations (only if both checkIn and checkOut exist)
│   grossMinutes   = actualCheckOut - actualCheckIn
│   workingMinutes = grossMinutes - breakMinutes
│   lateMinutes    = max(0, (actualCheckIn - shiftStart) - graceMinutes)
│   earlyLeave     = max(0, shiftEnd - actualCheckOut)
│   overtime       = actualCheckOut > shiftEnd + overtimeThreshold
│                    ? (actualCheckOut - shiftEnd) : 0
│
├── 8. Determine Final Status
│   if (anomaly detected)      → MISSING_PUNCH
│   else if (lateMinutes > 0)  → LATE
│   else if (earlyLeave > 0)   → EARLY_LEAVE
│   else                       → PRESENT
│
└── 9. Upsert DailyAttendanceReport
    - Skip if isManualOverride = true (don't overwrite HR corrections)
    - Otherwise create or update the record
```

---

## 7. Manual Override Flow (For Extreme Overtime & Corrections)

When an employee works beyond the Check-Out Window (e.g., till 11:30 PM or next day 2 AM):
1. The engine calculates hours **only within the defined windows**
2. The extra time is **not auto-calculated** (it falls outside the Check-Out Window)
3. Admin opens the reports dashboard, sees the employee's record
4. Admin uses `PUT /api/v1/reports/:id/override` to:
   - Set `manualOvertimeMinutes` (e.g., 90 minutes for staying till 11:30 PM)
   - Set `manualNote` (e.g., "Approved by Dr. Khan — emergency surgery coverage")
   - Set `isManualOverride = true` (prevents future cron runs from overwriting)

---

## 8. File Summary

| Action | File | Purpose |
|--------|------|---------|
| **MODIFY** | `prisma/schema.prisma` | Add 4 new models, add `isDuplicate` to AttendanceLog |
| **NEW** | `src/services/shiftService.ts` | Shift timetable CRUD + validation |
| **NEW** | `src/services/scheduleService.ts` | Employee schedule CRUD + bulk assign |
| **NEW** | `src/services/duplicateDetectionService.ts` | Duplicate punch filter |
| **NEW** | `src/services/attendanceCalculationService.ts` | Core window-based calculation engine |
| **NEW** | `src/services/configService.ts` | System config read/write + seeding |
| **NEW** | `src/api/routes/shifts.ts` | Shift management API endpoints |
| **NEW** | `src/api/routes/schedules.ts` | Schedule management API endpoints |
| **NEW** | `src/api/routes/reports.ts` | Daily reports, summary & override API |
| **NEW** | `src/api/routes/configs.ts` | System config API endpoints |
| **NEW** | `src/scheduler/attendanceWorker.ts` | Cron-based calculation worker |
| **MODIFY** | `src/api/routes/attendance.ts` | Enhanced filtering (date range, exclude duplicates) |
| **MODIFY** | `src/app.ts` | Register 4 new route modules |
| **MODIFY** | `src/index.ts` | Start attendance worker on boot |
| **MODIFY** | `src/config/index.ts` | Add TIMEZONE constant |
