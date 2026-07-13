# ZKTeco SDK Middleware — Step-by-Step TODO

> Follow this list in order. Each phase depends on the previous one.
> Mark items as `[x]` when done, `[/]` when in progress.

---

## Phase 1: Project Setup & Device Connectivity

**Goal:** Professional project scaffolding + verify we can connect to a ZKTeco device.

### 1.1 Project Initialization
- [x] Initialize Node.js project (`npm init`)
- [x] Install core dependencies:
  - `express` — web framework
  - `prisma` + `@prisma/client` — ORM (v6 — Prisma 7 has breaking config changes)
  - `dotenv` — environment variables
  - `winston` — logging
  - `cors` — CORS handling
  - `helmet` — security headers
  - `morgan` — HTTP request logging
  - `zkteco-js` — Pull SDK
  - `node-cron` — scheduler
- [x] Install dev dependencies:
  - `typescript`, `ts-node`, `tsx` — TypeScript execution
  - `@types/*` — Type definitions for Express, Node, etc.
- [x] Create `.env` and `.env.example` with:
  - `PORT=8081`
  - `DATABASE_URL=postgresql://...`
  - `NODE_ENV=development`
  - `API_KEY=your-secret-key`
- [x] Create `.gitignore` (node_modules, .env, prisma migrations, logs)
- [x] Set up folder structure as per plan.md

### 1.2 Core Server Setup
- [x] Create `src/config/index.js` — centralized config from env vars
- [x] Create `src/utils/logger.js` — Winston logger (console + file)
- [x] Create `src/utils/helpers.js` — Response formatters, IP validation, utilities
- [x] Create `src/app.js` — Express app with middleware (cors, helmet, morgan, json parser, text parser)
- [x] Create `src/index.js` — Server entry point (listen on PORT, graceful shutdown)
- [x] Add health check endpoint: `GET /health` → returns `{ status: "ok", uptime, timestamp }` ✅ Tested
- [x] Add npm scripts: `dev` (nodemon), `start` (node), `db:migrate`, `db:generate`, `db:studio`
- [x] Verify server starts and `/health` responds ✅ Working

### 1.3 Database Setup
- [x] Create Prisma schema (`prisma/schema.prisma`) with PostgreSQL provider
- [x] Define all 6 models: Device, User, UserDevice, AttendanceLog, Webhook, CommandQueue
- [x] Run initial migration: `npx prisma migrate dev --name init` ✅ Applied
- [x] Create `src/database/prisma.js` — Prisma client singleton with error logging
- [x] Verify DB connection on server startup (log success/failure) ✅ Connected

### 1.4 Pull SDK — Device Connectivity Test
- [x] Install `zkteco-js` package
- [x] Create `src/pull/connectionManager.js`:
  - `connect(ip, port)` — establishes TCP connection
  - `disconnect(ip, port)` — closes connection
  - `getStatus(ip, port)` — returns connected/disconnected + uptime
  - `getDevice(ip, port)` — get ZKTeco instance
  - `getAllConnections()` — list all active connections
  - `disconnectAll()` — shutdown cleanup
- [x] Create `src/pull/operations.js`:
  - `getDeviceInfo(ip)` — returns serial, firmware, capacity, counts
  - `ping(ip)` — quick connect/disconnect to test reachability
  - `getUsers(ip)` — fetch enrolled users
  - `getAttendances(ip)` — fetch attendance logs
  - `getDeviceStatus(ip)` — comprehensive status (info + counts)
- [x] Create test route: `GET /api/v1/test/connect?ip=x.x.x.x` ✅ Ready
- [x] Create test route: `GET /api/v1/test/ping?ip=x.x.x.x` ✅ Ready
- [x] Create test route: `GET /api/v1/test/status?ip=x.x.x.x` ✅ Ready
- [x] Create test route: `GET /api/v1/test/users?ip=x.x.x.x` ✅ Ready
- [x] Create test route: `GET /api/v1/test/attendance?ip=x.x.x.x` ✅ Ready
- [x] Create test route: `GET /api/v1/test/connections` ✅ Tested
- [ ] **TEST:** Connect to actual SenseFace 3A device (need device IP)
- [ ] **DOCUMENT:** Log and save the actual data shapes returned by the device

---

## Phase 2: Push Protocol — Receive Data from Device

**Goal:** Device automatically sends attendance data to our server.

### 2.1 Push Protocol Routes
- [ ] Create `src/push/parser.js`:
  - `parseAttendanceLog(body)` — parse tab-separated ATTLOG data
  - `parseOperationLog(body)` — parse OPERLOG data
  - `parseUserInfo(body)` — parse user data push
- [ ] Create `src/push/handlers/registration.js`:
  - Handle `GET /iclock/cdata` (device handshake)
  - Extract SN, pushver, language from query params
  - Auto-register device in DB if new
  - Return proper options string (Stamp, Realtime, TransFlag, etc.)
- [x] Create `src/push/handlers/attendance.js`:
  - Handle `POST /iclock/cdata?table=ATTLOG`
  - Parse attendance records from body
  - Save to `attendance_logs` table
  - Return "OK"
- [x] Create `src/push/handlers/operlog.js`:
  - Handle `POST /iclock/cdata?table=OPERLOG`
  - Parse and store operation logs
  - Return "OK"
- [x] Create `src/push/pushRouter.js`:
  - Mount all `/iclock/*` routes
  - Log all incoming push requests for debugging

### 2.2 Command Queue (Push-based commands)
- [x] Create `src/push/handlers/devicecmd.js`:
  - Handle `POST /iclock/devicecmd` — receive command results
  - Update command status in `command_queue` table
- [x] Implement `GET /iclock/getrequest` handler:
  - Query `command_queue` for pending commands for this device
  - Return formatted command string or "OK" if none
- [x] Add `CommandQueue` model to Prisma schema
- [x] Run migration

### 2.3 Database Models for Push Data
- [x] Add `AttendanceLog` model to Prisma schema
- [x] Run migration
- [x] Verify data persistence

### 2.4 Test Push Protocol
- [ ] **DOCUMENT:** Log actual push request format (headers, body, query params)
- [ ] **DOCUMENT:** Save actual attendance data format for API reference

---

## Phase 3: ADMS Device Control & APIs

**Goal:** Provide REST APIs to queue commands for the devices to execute via ADMS.

### 3.1 Command Service
- [x] Create `src/services/commandService.ts`
  - `queueReboot(sn)` — send REBOOT command
  - `queueUnlock(sn)` — send AC_UNLOCK command
  - `queueClearLogs(sn)` — send CLEAR LOG command
  - `queueSyncTime(sn)` — send time sync command

### 3.2 Command REST APIs
- [x] Create `src/api/routes/commands.ts`
- [x] `POST /api/v1/commands/reboot/:sn`
- [x] `POST /api/v1/commands/unlock/:sn`
- [x] `POST /api/v1/commands/clear-log/:sn`
- [x] `POST /api/v1/commands/sync-time/:sn`
- [x] `GET /api/v1/commands/status/:id` — Check if command succeeded
- [x] Mount router in `app.ts`

### 3.3 Add Remaining DB Models
- [ ] Add `User` model to Prisma schema ✅ (Done in Phase 1)
- [ ] Add `UserDevice` model (many-to-many relation) ✅ (Done in Phase 1)
- [ ] Add `Webhook` model ✅ (Done in Phase 1)
- [ ] Run migration ✅ (Done in Phase 1)

---

## Phase 4: REST API for Backend Apps

**Goal:** Hospital/school apps can consume device data via clean REST API.

### 4.1 Device API
- [ ] Create `src/api/routes/devices.js`:
  - `GET    /api/v1/devices` — list all devices
  - `GET    /api/v1/devices/:sn` — get device by serial
  - `POST   /api/v1/devices` — register device manually
  - `PUT    /api/v1/devices/:sn` — update device info
  - `DELETE /api/v1/devices/:sn` — remove device
- [ ] Create `src/services/deviceService.js` — business logic

### 4.2 Attendance API
- [ ] Create `src/api/routes/attendance.js`:
  - `GET    /api/v1/attendance` — query logs (filter: date, user, device)
  - `GET    /api/v1/attendance/today` — today's summary
  - `GET    /api/v1/attendance/report` — date range report
  - `POST   /api/v1/attendance/sync` — force pull-sync from device
  - `DELETE /api/v1/attendance/clear/:sn` — clear device logs
- [ ] Create `src/services/attendanceService.js`

### 4.3 User Management API
- [ ] Create `src/api/routes/users.js`:
  - `GET    /api/v1/users` — list all users
  - `GET    /api/v1/users/:uid` — get user details
  - `POST   /api/v1/users` — create user (+ push to device)
  - `PUT    /api/v1/users/:uid` — update user (+ sync to device)
  - `DELETE /api/v1/users/:uid` — delete user (+ remove from device)
  - `POST   /api/v1/users/sync` — bulk sync users
- [ ] Create `src/services/userService.js`

### 4.4 Template & Command APIs
- [ ] Create `src/api/routes/templates.js`:
  - `GET    /api/v1/templates/:uid` — get templates
  - `POST   /api/v1/templates/upload` — upload template
  - `POST   /api/v1/templates/enroll` — trigger enrollment
  - `POST   /api/v1/templates/sync` — sync between devices
- [ ] Create `src/api/routes/commands.js`:
  - `POST   /api/v1/commands/reboot/:sn` — reboot device
  - `POST   /api/v1/commands/sync-time/:sn` — sync clock
  - `POST   /api/v1/commands/lock/:sn` — lock/unlock door
  - `GET    /api/v1/commands/status/:sn` — pending commands

### 4.5 API Middleware
- [ ] Create `src/api/middleware/auth.js` — API key validation
- [ ] Create `src/api/middleware/errorHandler.js` — global error handler
- [ ] Create `src/api/middleware/validation.js` — request validation (Joi or Zod)
- [ ] Mount all API routes in `app.js`

---

## Phase 5: Webhooks, Real-time & Dashboard

**Goal:** Backend apps get instant notifications + admin can monitor devices.

### 5.1 Webhook System
- [ ] Create `src/api/routes/webhooks.js`:
  - `POST   /api/v1/webhooks` — register webhook URL
  - `GET    /api/v1/webhooks` — list webhooks
  - `DELETE /api/v1/webhooks/:id` — remove webhook
- [ ] Create `src/services/webhookService.js`:
  - `triggerWebhooks(event, data)` — POST to all registered URLs
  - `retryFailedWebhooks()` — retry queue for failed deliveries
  - HMAC signature for webhook verification
- [ ] Integrate webhook triggers into:
  - Push attendance handler (new punch → fire webhook)
  - Device status changes (online/offline → fire webhook)
  - User changes (add/remove → fire webhook)

### 5.2 WebSocket Real-time Events
- [ ] Create `src/websocket/socketManager.js`:
  - Socket.io server setup
  - Event channels: `attendance`, `device-status`, `commands`
- [ ] Emit events when:
  - New attendance record received
  - Device comes online/offline
  - Command completes
- [ ] Client-side connection example in docs

### 5.3 Admin Dashboard
- [ ] Create `dashboard/index.html` — device list, status indicators
- [ ] Create `dashboard/style.css` — clean admin UI
- [ ] Create `dashboard/app.js`:
  - Fetch and display connected devices
  - Live attendance feed (via WebSocket)
  - Device status indicators (online/offline)
  - Quick actions (sync, reboot, view logs)
- [ ] Serve dashboard from Express (`/dashboard`)

---

## Phase 6: Production Hardening

**Goal:** Make the system reliable, secure, and deployable.

### 6.1 Security
- [ ] Rate limiting on API endpoints
- [ ] Input sanitization on all routes
- [ ] HTTPS support (optional, for cloud deployment)
- [ ] Secure API key rotation mechanism
- [ ] Validate push requests come from known device SNs

### 6.2 Reliability
- [ ] PM2 ecosystem config for Windows service
- [ ] Auto-restart on crash
- [ ] Database connection pooling and health checks
- [ ] Graceful shutdown handling
- [ ] Request timeout configuration

### 6.3 Monitoring & Logging
- [ ] Structured log files with rotation (Winston daily rotate)
- [ ] Device heartbeat monitoring (mark offline after N missed polls)
- [ ] Alert webhook when device goes offline
- [ ] Error tracking and reporting

### 6.4 Multi-Device Testing
- [ ] Test with additional ZKTeco device models
- [ ] Verify push protocol compatibility across models
- [ ] Verify pull SDK compatibility across models
- [ ] Load test with simulated multiple devices

### 6.5 Documentation
- [ ] API documentation (Swagger/OpenAPI or markdown)
- [ ] Device configuration guide
- [ ] Webhook integration guide for backend apps
- [ ] Troubleshooting guide
- [ ] Deployment guide (local PC + cloud Docker)

### 6.6 Deployment Options
- [ ] Docker + docker-compose setup
- [ ] Cloud deployment guide (VPS/AWS)
- [ ] Database backup strategy
- [ ] Environment-specific configs (dev/staging/prod)

---

## Quick Reference: What to Test at Each Phase

| Phase | Test Command / Action | Expected Result |
|-------|----------------------|-----------------|
| 1 | `GET /health` | `{ status: "ok" }` |
| 1 | `GET /api/v1/test/connect?ip=192.168.x.x` | Device info JSON |
| 2 | Configure device push → punch on device | Attendance in DB |
| 3 | `GET /api/v1/test/users?ip=x.x.x.x` | User list from device |
| 4 | `GET /api/v1/attendance?date=2026-07-13` | Filtered attendance |
| 5 | Register webhook → punch on device | Webhook POST received |
