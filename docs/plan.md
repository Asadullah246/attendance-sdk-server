# ZKTeco SDK Middleware Server — Project Plan

> **Last Updated:** 2026-07-13
> **Stack:** Node.js / Express / PostgreSQL / zkteco-js
> **Goal:** License-free middleware that connects ZKTeco devices directly to any backend app

---

## 1. Problem & Goal

**Problem:** BioTime (paid, license issues) and ZKBio.net (connection failures) are unreliable third-party dependencies for managing ZKTeco attendance devices.

**Goal:** Build a self-hosted Node.js middleware server that:
- Communicates directly with ZKTeco devices (SenseFace 3A + future models)
- Stores data in PostgreSQL
- Exposes REST APIs for any backend app (hospital, school, etc.)
- Costs $0 in licensing

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ZKTeco Devices                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ SenseFace 3A │  │  Device 2    │  │  Device N    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │ HTTP Push       │ HTTP Push       │ HTTP Push
          │ (ADMS/iClock)   │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                SDK Middleware Server (Node.js)                   │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  Push Receiver   │    │  Pull Engine      │                   │
│  │  /iclock/* routes│    │  TCP Socket :4370  │                   │
│  │  (device → us)   │    │  (us → device)     │                   │
│  └────────┬────────┘    └────────┬─────────┘                    │
│           │                      │                               │
│           ▼                      ▼                               │
│  ┌──────────────────────────────────────────┐                   │
│  │           PostgreSQL Database             │                   │
│  │  devices | users | attendance | webhooks  │                   │
│  └────────────────────┬─────────────────────┘                   │
│                       │                                          │
│  ┌────────────────────▼─────────────────────┐                   │
│  │         REST API  /api/v1/*               │                   │
│  │  + WebSocket /ws/events                   │                   │
│  │  + Admin Dashboard                        │                   │
│  └────────────────────┬─────────────────────┘                   │
└───────────────────────┼─────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   ┌────────────┐ ┌──────────┐ ┌───────────┐
   │ Hospital   │ │ School   │ │ Other App │
   │ Management │ │ Mgmt     │ │           │
   └────────────┘ └──────────┘ └───────────┘
```

---

## 3. Communication Approaches

### 3.1 Push Protocol (ADMS/iClock) — PRIMARY

The device initiates HTTP requests to our server. Real-time, scalable, no polling needed.

**Endpoints our server implements:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/iclock/cdata` | GET | Device registration / handshake |
| `/iclock/cdata` | POST | Push attendance logs (`ATTLOG`), operation logs (`OPERLOG`) |
| `/iclock/getrequest` | GET | Device polls for pending commands |
| `/iclock/devicecmd` | POST | Device reports command execution results |

**Push Flow:**
```
1. Device boots → GET /iclock/cdata?SN=XXXX (registration)
2. Employee punches → POST /iclock/cdata?table=ATTLOG (attendance)
3. Device polls → GET /iclock/getrequest?SN=XXXX (check commands)
4. Device executes → POST /iclock/devicecmd (report result)
```

### 3.2 Pull SDK (TCP Socket) — SECONDARY

Our server connects to the device's IP:4370 via TCP for admin operations.

**Library: `zkteco-js`** (chosen over `node-zklib` for better maintenance, more features, and broader device compatibility)

**Available Operations:**

| Operation | Purpose |
|-----------|---------|
| `createSocket()` | Connect to device |
| `disconnect()` | Disconnect from device |
| `getInfo()` | Get device info (serial, firmware, capacity) |
| `getUsers()` | Fetch all enrolled users |
| `setUser(uid, name, ...)` | Create/update user |
| `deleteUser(uid)` | Remove user |
| `getAttendances()` | Fetch attendance logs |
| `getTemplates()` | Get biometric templates |
| `uploadFingerTemplate(...)` | Upload fingerprint template |
| `enrollUser(uid, fid)` | Start enrollment |
| `clearAttendanceLog()` | Clear logs after backup |
| `reboot()` | Restart device |
| `setTime(date)` | Sync device clock |

---

## 4. Technology Stack (Final Decisions)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Runtime | Node.js 20 LTS | |
| Framework | Express.js | |
| Database | **PostgreSQL** | Production-ready, cloud-compatible |
| ORM | Prisma | Type-safe, migrations, great DX |
| Pull SDK | **`zkteco-js`** | More features, actively maintained |
| Push Receiver | Custom Express routes | iClock/ADMS protocol |
| Real-time | Socket.io | WebSocket events |
| Scheduler | node-cron | Health checks, periodic sync |
| Logging | Winston | Structured logging |
| Auth | API Key | Simple, effective for service-to-service |
| Process Manager | PM2 | Auto-restart on Windows |

---

## 5. Database Schema

```sql
-- Registered devices
CREATE TABLE devices (
    id              SERIAL PRIMARY KEY,
    serial_number   VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(100),
    model           VARCHAR(50),
    ip_address      VARCHAR(45),
    location        VARCHAR(200),
    firmware        VARCHAR(50),
    platform        VARCHAR(50),
    mac_address     VARCHAR(20),
    is_online       BOOLEAN DEFAULT FALSE,
    last_activity   TIMESTAMPTZ,
    push_enabled    BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Users/Employees synced to devices
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    uid             INTEGER NOT NULL,
    name            VARCHAR(100) NOT NULL,
    employee_id     VARCHAR(50),
    card_number     VARCHAR(20),
    privilege       INTEGER DEFAULT 0,
    password        VARCHAR(10),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Which users are on which devices
CREATE TABLE user_devices (
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id       INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    synced_at       TIMESTAMPTZ,
    PRIMARY KEY (user_id, device_id)
);

-- Attendance records
CREATE TABLE attendance_logs (
    id              SERIAL PRIMARY KEY,
    device_sn       VARCHAR(50) NOT NULL,
    uid             INTEGER NOT NULL,
    punch_time      TIMESTAMPTZ NOT NULL,
    status          INTEGER,
    verify_type     INTEGER,
    source          VARCHAR(10) DEFAULT 'push',
    forwarded       BOOLEAN DEFAULT FALSE,
    raw_data        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_sn, uid, punch_time)
);

-- Webhook subscriptions
CREATE TABLE webhooks (
    id              SERIAL PRIMARY KEY,
    url             VARCHAR(500) NOT NULL,
    events          VARCHAR(200) DEFAULT '*',
    secret          VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    last_triggered  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Command queue (for push protocol)
CREATE TABLE command_queue (
    id              SERIAL PRIMARY KEY,
    device_sn       VARCHAR(50) NOT NULL,
    command_type    VARCHAR(50) NOT NULL,
    command_data    TEXT NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',
    result          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);
```

---

## 6. Project Structure

```
sdk-server/
├── docs/
│   ├── plan.md                    # This file
│   └── todo.md                    # Step-by-step task list
├── package.json
├── .env
├── .env.example
├── .gitignore
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/
├── src/
│   ├── index.js                   # App entry point
│   ├── app.js                     # Express app setup
│   ├── config/
│   │   └── index.js               # Env config loader
│   │
│   ├── database/
│   │   └── prisma.js              # Prisma client singleton
│   │
│   ├── push/                      # ── ADMS/iClock Push Protocol ──
│   │   ├── pushRouter.js          # /iclock/* route definitions
│   │   ├── parser.js              # Parse iClock tab-separated data
│   │   └── handlers/
│   │       ├── registration.js    # Device handshake (GET /iclock/cdata)
│   │       ├── attendance.js      # ATTLOG receiver (POST /iclock/cdata)
│   │       ├── operlog.js         # Operation log receiver
│   │       └── devicecmd.js       # Command result handler
│   │
│   ├── pull/                      # ── TCP Pull SDK (zkteco-js) ──
│   │   ├── connectionManager.js   # Manage TCP connections to devices
│   │   └── operations.js          # High-level pull operations
│   │
│   ├── api/                       # ── REST API for backend apps ──
│   │   ├── routes/
│   │   │   ├── devices.js         # /api/v1/devices
│   │   │   ├── attendance.js      # /api/v1/attendance
│   │   │   ├── users.js           # /api/v1/users
│   │   │   ├── templates.js       # /api/v1/templates
│   │   │   ├── commands.js        # /api/v1/commands
│   │   │   └── webhooks.js        # /api/v1/webhooks
│   │   └── middleware/
│   │       ├── auth.js            # API key validation
│   │       ├── errorHandler.js    # Global error handler
│   │       └── validation.js      # Request validation
│   │
│   ├── services/                  # ── Business Logic ──
│   │   ├── deviceService.js
│   │   ├── attendanceService.js
│   │   ├── userService.js
│   │   ├── templateService.js
│   │   ├── commandService.js
│   │   ├── webhookService.js
│   │   └── syncService.js
│   │
│   ├── websocket/
│   │   └── socketManager.js       # Socket.io real-time events
│   │
│   ├── scheduler/
│   │   └── jobs.js                # Cron jobs (health check, sync)
│   │
│   └── utils/
│       ├── logger.js              # Winston logger
│       └── helpers.js             # Utility functions
│
├── dashboard/                     # Admin web UI (later phase)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── tests/                         # Test files
    ├── push/
    ├── pull/
    └── api/
```

---

## 7. Implementation Phases (Device-First Approach)

### Phase 1: Project Setup & Device Connectivity (Week 1)
Set up the project properly and verify we can **connect** to devices.

**Focus:** "Can we talk to the device?"

### Phase 2: Push Protocol — Receive Data from Device (Week 1-2)
Implement the iClock/ADMS push receiver so devices can send data to us.

**Focus:** "Can the device send us attendance data?"

### Phase 3: Pull SDK — Query & Command Devices (Week 2-3)
Use `zkteco-js` to pull data from devices and send commands.

**Focus:** "Can we actively query the device and push users/commands?"

### Phase 4: REST API for Backend Apps (Week 3-4)
Build the API that hospital/school apps will consume.

**Focus:** "Can our backend apps get the data they need?"

### Phase 5: Webhooks, Real-time & Dashboard (Week 4-5)
Auto-forward events to backend apps and build admin UI.

**Focus:** "Can backend apps get instant notifications?"

### Phase 6: Production Hardening (Week 5-6)
Security, monitoring, error handling, multi-device testing.

**Focus:** "Is it reliable and secure enough for production?"

---

## 8. Device Configuration (SenseFace 3A)

### One-time setup on each device:
1. **Comm. → Ethernet** → Static IP (e.g., `192.168.1.201`)
2. **Comm. → Cloud Server Setting**:
   - Server Address: `192.168.1.100` (your PC's IP)
   - Server Port: `8081`
   - Enable Push: ON
   - Protocol: HTTP
3. Ensure firmware is in **TA Push** mode

### Verify connection:
- After config, device sends `GET /iclock/cdata?SN=XXXX` within 30-60 seconds
- Check server logs for registration handshake

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `zkteco-js` library bugs | Fork the repo, test thoroughly, contribute fixes |
| Firmware updates break protocol | Pin firmware versions, test updates on one device first |
| Network interruptions | Device stores offline logs; pull-sync catches missed records |
| New device model incompatible | Push protocol is standard across ZKTeco models |
| Server crashes | PM2 auto-restart + database persistence |

---

## 10. Key Data Types Reference

These will be confirmed once we connect to the actual device:

**Attendance Record (from push):**
```
UID: integer
Timestamp: datetime
Status: integer (0=Check-in, 1=Check-out, 2=Break-out, 3=Break-in, 4=OT-in, 5=OT-out)
VerifyType: integer (1=Finger, 4=Card, 15=Face, 0=Password)
WorkCode: integer
```

**User Record (from pull):**
```
uid: integer
name: string
role: integer (0=User, 2=Enroller, 6=Admin, 14=SuperAdmin)
password: string
cardno: integer
userId: string (employee ID)
```

**Device Info (from pull):**
```
serialNumber: string
platform: string
firmwareVersion: string
userCount: integer
logCount: integer
faceCount: integer
fingerCount: integer
```

> **Note:** Actual data shapes will be documented as we implement each phase and receive real device data.
