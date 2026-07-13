# ZKTeco SDK Server - API Integration Guide

This document outlines the API endpoints and Webhook structure required for the Main Application to communicate with the ZKTeco SDK Server.

The SDK Server acts as a middleware bridge. It handles all direct communication with the physical hardware and guarantees zero data loss via queuing.

---

## 1. Create / Sync User to Device
Call this API from the Main Application when HR creates a new employee. This will save the user in the SDK database as `pending_add` and queue the command to the physical device.

- **Endpoint:** `POST /api/v1/users`
- **Content-Type:** `application/json`

### Request Body:
```json
{
  "uid": "1001",              // (String/Number) Unique Employee ID
  "name": "John Doe",         // (String) Employee Name
  "privilege": 0,             // (Number) 0 for Normal User, 14 for SuperAdmin
  "deviceSn": "VGU6251900138" // (String) The exact Serial Number of the physical device
}
```

### Success Response (200 OK):
```json
{
  "success": true,
  "message": "User John Doe created and command queued for VGU6251900138",
  "data": {
    "id": 1001,
    "uid": 1001,
    "name": "John Doe",
    "privilege": 0,
    "status": "pending_add"
  }
}
```

---

## 2. Delete User from Device
Call this API when an employee is terminated. It changes their status to `pending_delete` and tells the device to wipe their face/fingerprint data.

- **Endpoint:** `DELETE /api/v1/users/:uid?deviceSn={SERIAL_NUMBER}`

### Request Parameters:
- **`uid`** (URL Param): The Employee's UID (e.g. `/api/v1/users/1001`)
- **`deviceSn`** (Query Param): The serial number of the device to delete them from (e.g. `?deviceSn=VGU6251900138`)

### Success Response (200 OK):
```json
{
  "success": true,
  "message": "User 1001 deleted and removal command queued for VGU6251900138",
  "data": null
}
```

---

## 3. Webhook Events (Push Notifications to Main App)
Instead of the Main App constantly polling the SDK Server, the SDK Server will actively send HTTP `POST` requests (Webhooks) to your Main App whenever something happens. 

If your Main App is offline, the SDK server will queue the webhook and retry every 15 seconds (up to 5 times).

**Your Main App must expose an endpoint (e.g. `POST /api/webhooks/zkteco`) to receive these.**

### Headers Received by Main App:
- `Content-Type: application/json`
- `X-ZKTeco-Event: <event_type>` (Use this to know what data is arriving)

### Event Type 1: `attendance` (Employee Punched In/Out)
Triggered instantly when an employee scans their face/fingerprint.
*Note: All punch times are automatically formatted to Bangladesh Standard Time (UTC+06:00).*

```json
{
  "id": 45,
  "deviceSn": "VGU6251900138",
  "uid": 1001,
  "punchTime": "2026-07-13T18:17:51.000Z",
  "verifyType": 15,
  "status": 1,
  "source": "push"
}
```
*(VerifyType 15 = Face, 1 = Fingerprint, 4 = RFID Card, 3 = Password)*

### Event Type 2: `command_completed` (Sync Confirmation)
Triggered when the device confirms it successfully executed your Create or Delete command.

```json
{
  "id": 12,
  "deviceSn": "VGU6251900138",
  "commandData": "DATA UPDATE USERINFO PIN=1001 Name=John Pri=0",
  "status": "completed",
  "result": "0" 
}
```
*(Result "0" means success. This means the user is now physically active on the device).*

### Event Type 3: `user_synced_from_device` (Manual Creation)
Triggered if a manager manually creates a new employee directly on the touchscreen of the physical device.

```json
{
  "deviceSn": "VGU6251900138",
  "user": {
    "uid": 1005,
    "name": "User 1005",
    "privilege": 0,
    "status": "active"
  }
}
```
