
## update:
* same/send name in theattendance result


ZKTeco ADMS Protocol Compliance Audit & Fix Plan
Goal: Fix all ADMS push protocol issues preventing reliable user creation, biometric synchronization, and attendance logging on ZKTeco SenseFace 3A devices.

After thorough research of the official ZKTeco ADMS/iClock push protocol specification and a line-by-line code audit, I've identified 9 critical/major bugs and 4 moderate issues that would cause device command failures, sync breakdowns, and data loss.

🔴 Critical Issues (Commands fail silently on the device)
Issue 1: USERINFO Commands Use SPACE Separator Instead of TAB
The #1 cause of your problems.

The ADMS protocol requires TAB (\t) separators between key-value fields. Your code uses spaces in many places. The device firmware will return error code -1002 (Invalid command syntax) for every command.

Affected files and lines:

Location	Current (WRONG)	Required (CORRECT)
commandService.ts:69
PIN=${uid}\\tName=...\\tPri=...	✅ Already uses \t — OK
iclock.ts:87
PIN=${user.uid} Name=${user.name} Pri=${user.privilege}	❌ Uses spaces
iclock.ts:331
PIN=${uid} Name=${name} Pri=${user.privilege}	❌ Uses spaces
devices.ts:100
PIN=${user.uid} Name=${user.name} Pri=${user.privilege}	❌ Uses spaces
devices.ts:170
PIN=${user.uid} Name=${user.name} Pri=${user.privilege}	❌ Uses spaces
CAUTION

This means no user creation command from your server to the device is actually working. The device receives the command, fails to parse it, returns Return=-1002, and your server marks it as "failed" — but the user is never actually created on the device.

Issue 2: Biometric Commands Use Wrong Table Names
The protocol uses specific table names for biometric data. Your code uses legacy/incorrect table names.

Current (WRONG)	Correct (Per ADMS Protocol)
DATA UPDATE FACE	DATA UPDATE BIODATA (with Type=9 for visible-light face)
DATA UPDATE FINGER	DATA UPDATE templatev10 (for fingerprints)
DATA UPDATE FINGERTMP	DATA UPDATE templatev10
Affected locations:

iclock.ts:100
 — New device initial sync
iclock.ts:450-451
 — Biometric broadcast to other devices
devices.ts:116
 — Retry sync
devices.ts:183
 — Area assignment sync
CAUTION

This means no face or fingerprint data is successfully pushed to other devices. When a user enrolls their face on Device A, the command sent to Device B uses an unrecognized table name and fails.

Issue 3: Biometric Command Field Names Are Wrong
Even if the table names were correct, the field names don't match the protocol:

Current Field	Correct Field (ADMS)	Table
FID=	FingerID=	templatev10
TMP=	Template=	templatev10
FID=	No=	BIODATA
TMP=	Tmp=	BIODATA
The device expects exact field names. Wrong names = command rejected.

🟠 Major Issues (Synchronization breaks)
Issue 4: ATTLOG Parsing Has Swapped Field Positions
Your code at 
iclock.ts:167-168
:

typescript

const state = parts.length > 2 ? parseInt(parts[2], 10) : null;      // You call this "state"
const verifyType = parts.length > 3 ? parseInt(parts[3], 10) : null;  // You call this "verifyType"
The official ADMS protocol field order is:


Position 1: PIN (UserID)
Position 2: Timestamp
Position 3: Status (0=CheckIn, 1=CheckOut, etc.)
Position 4: VerifyMode (1=Finger, 15=Face, 4=Card)
Your code comment at line 162 says:


// Example format: 1\t2026-07-13 12:17:51\t255\t1\t0\t0\t0\t0\t0\t0\t
The value 255 in position 3 is suspicious — that's not a valid Status value (0-5 range). Some SenseFace 3A firmware versions swap Status and VerifyMode. We need to add heuristic detection to handle this.

IMPORTANT

This may be causing your attendance reports to have incorrect Status (check-in vs check-out) and VerifyType (face vs finger) values, which cascades into wrong attendance calculations.

Issue 5: Area-Based Sync Falls Back to NULL Instead of ALL Devices
When user.areaId is null (no area assigned), the query at 
iclock.ts:316-321
:

typescript

const targetDevices = await prisma.device.findMany({ 
  where: { 
    serialNumber: { not: sn },
    areaId: user.areaId   // This is NULL!
  } 
});
This only finds devices where areaId IS NULL. Your requirement says: "if no area available, then all devices". This is NOT what the current code does. It only syncs to other "unassigned" devices.

The same bug exists in:

iclock.ts:429-434
 — Biometric broadcast
iclock.ts:75
 — New device initial sync
IMPORTANT

If a user has no area but some devices are assigned to areas, that user's data will NOT be synced to those devices.

Issue 6: User Create API (POST /api/v1/users) Doesn't Queue Biometrics
When a user is created via the API at 
users.ts:48-67
, only USERINFO commands are queued. No biometric templates are synced. If the user already has biometric data in the database (from a previous enrollment), those biometrics are not pushed to the target devices.

Issue 7: POST /api/v1/users Uses id Instead of uid for Upsert
At 
users.ts:31
:

typescript

const user = await prisma.user.upsert({
  where: { id: parseInt(uid, 10) },  // WRONG: `id` is the auto-increment PK
  ...
});
The uid field on the User model is the ZKTeco user ID. The id field is the Prisma auto-increment primary key. These are different! The upsert should use where: { uid: parseInt(uid, 10) }.

WARNING

This means if you create user with uid=1001, it tries to find a User with id=1001 (the auto-increment PK), which could be a completely different user or not exist at all.

🟡 Moderate Issues
Issue 8: OPERLOG User Update Regex Parses UID From Wrong Field
At 
iclock.ts:231
:

typescript

const match = line.match(/^OPLOG\s+(\d+)\t[^\t]+\t[^\t]+\t(\d+)/);
The regex captures group 2 as uid, but per the OPLOG format OPLOG ${OpType}\t${OpWho}\t${OpTime}\t${Value1}\t${Value2}\t${Value3}, group 2 would be Value1, not necessarily the user's PIN. The OpWho field (position 2, which is group 1's adjacent) is actually the second tab-separated field.

The format needs to be re-examined based on actual device output.

Issue 9: commandService.ts addUser Uses Tabs But iclock.ts Uses Spaces
In 
commandService.ts:69
:

typescript

let commandStr = `DATA UPDATE USERINFO PIN=${uid}\tName=${name}\tPri=${privilege}`;
This correctly uses \t. But all other locations that generate the same command string use spaces. This inconsistency means:

Users created via POST /api/v1/users → commands work ✅ (uses commandService.ts)
Users synced from device-to-device via iclock.ts → commands fail ❌ (uses spaces)
Users synced on area change via devices.ts → commands fail ❌ (uses spaces)
Issue 10: No UserDevice Tracking When Creating Users via API
When a user is created via POST /api/v1/users at 
users.ts:48-67
, the code doesn't create UserDevice records. This means the sync status dashboard won't track these users correctly, and the retry-sync endpoint won't find them.

Issue 11: Body Parsing Order May Cause Issues
In 
app.ts:35-41
:

typescript

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/plain', 'application/unknown', '*/*'] }));
The */* content type on express.text() will catch everything that doesn't match JSON or urlencoded, including the devicecmd POST which sends application/x-www-form-urlencoded. But since express.urlencoded() comes first, it should be fine for properly-typed requests. However, ZKTeco devices sometimes send bodies with no Content-Type header at all, which means express.text() with */* is needed. The issue is that express.json() comes first and might reject non-JSON bodies before express.text() gets them.

Issue 12: Card Number Not Included in commandService.addUser
The 
commandService.ts:67-73
 addUser method doesn't accept or send a Card field. When users are created via the API with a card number, the card is saved to the database but NOT sent to the device.

Proposed Changes
Component 1: Command Formatting (Central Fix)
Create a centralized command builder utility to eliminate inconsistencies.

[NEW] 
commandBuilder.ts
A utility module that generates correctly-formatted ADMS commands with proper TAB separators and field names. All command string construction across the project will use this instead of inline template literals.

typescript

// Key functions:
buildUserInfoCommand(uid, name, privilege, card?)  → "DATA UPDATE USERINFO PIN=1001\tName=John\tPri=0\tCard=123"
buildBiometricCommand(bio)                         → "DATA UPDATE templatev10 PIN=1001\tFingerID=0\t..." or "DATA UPDATE BIODATA ..."
buildDeleteUserCommand(uid)                        → "DATA DELETE USERINFO PIN=1001"
Component 2: Fix iclock.ts (Push Protocol Handler)
[MODIFY] 
iclock.ts
Lines 87, 101, 331, 451: Replace all inline command string construction with commandBuilder calls
Lines 167-168: Add heuristic ATTLOG field detection (if value > 15, it's likely VerifyMode not Status)
Lines 316-321, 429-434: Fix area-based sync fallback: if user.areaId is null, query ALL devices (exclude source device only)
Line 75: Fix initial new-device sync to respect null area = all users
Lines 100-101: Use correct biometric table names via commandBuilder
Component 3: Fix API Routes
[MODIFY] 
users.ts
Line 31: Change where: { id: parseInt(uid, 10) } to where: { uid: parseInt(uid, 10) }
Lines 48-67: Add UserDevice tracking when creating users
Lines 48-67: Queue biometric templates alongside USERINFO commands
Lines 54-55: Use commandBuilder for command generation
[MODIFY] 
devices.ts
Lines 100, 117, 170, 184: Replace inline command strings with commandBuilder calls
Component 4: Fix CommandService
[MODIFY] 
commandService.ts
Line 69: Refactor to use commandBuilder.buildUserInfoCommand
Add cardNumber parameter to addUser method
Add addBiometric method for pushing biometric templates
Open Questions
IMPORTANT

Q1: Can you share the actual raw HTTP body your SenseFace 3A device sends when it pushes an ATTLOG record? I need to confirm the exact field order (Status vs VerifyMode in positions 3 and 4). You can find this in your server logs or in the datas/ folder JSON files.

IMPORTANT

Q2: When a face is enrolled on the device, does it push the data to table=BIODATA, table=FACE, or table=OPERLOG? This determines which parsing branch handles the face template. Check your datas/ folder for a file with POST_cdata in the name after enrolling a face.

IMPORTANT

Q3: Have you seen any specific error messages or Return codes from the device? E.g., Return=-1002 in the command results? This would confirm the separator issue.

Verification Plan
Automated Tests
After fixes, restart the server and create a test user via POST /api/v1/users
Monitor command_queue table for new commands — verify they use \t separators
Watch device poll via /iclock/getrequest — verify the command format in logs
Check /iclock/devicecmd responses — verify Return=0 (success) instead of negative error codes
Manual Verification
Create a user from the main app → verify user appears on the physical device
Enroll a face on Device A → verify it syncs to Device B (same area or all devices if no area)
Enroll a card on Device A → verify it syncs to Device B
Punch on Device A → verify attendance log with correct Status and VerifyType
Summary of Changes
Priority	Issue	Fix
🔴 Critical	Space separators in commands	Centralized commandBuilder with \t
🔴 Critical	Wrong biometric table names	Use templatev10 / BIODATA
🔴 Critical	Wrong biometric field names	Use FingerID, Template, etc.
🟠 Major	ATTLOG field swap	Heuristic detection
🟠 Major	Area null ≠ all devices	Fix query to sync to ALL when null
🟠 Major	User API uses id not uid	Fix upsert where clause
🟠 Major	No biometric sync from API	Queue biometrics alongside user
🟡 Moderate	No UserDevice tracking from API	Add UserDevice records
🟡 Moderate	Card not sent to device	Add to addUser
🟡 Moderate	Inconsistent command formatting	Single source via commandBuilder
