/**
 * Centralized ADMS Command Builder
 *
 * All ZKTeco ADMS push-protocol commands MUST be constructed through this module.
 * Key formatting rules enforced here:
 *   - Fields are separated by TAB (\t), NOT spaces
 *   - USERINFO uses: PIN, Name, Pri, Card, Passwd
 *   - Face data uses table "BIODATA" with fields: Pin, No, Index, Valid, Duress, Type, MajorVer, MinorVer, Format, Tmp
 *   - Fingerprint data uses table "templatev10" with fields: PIN, FingerID, Size, Valid, Template
 */

export interface BiometricData {
  uid: number;
  type: number;       // 1 = Fingerprint, 9/15 = Face
  fingerId: number;   // finger index (0-9) or face index (usually 0)
  size: number;
  valid: number;
  template: string;   // Base64 encoded template
  rawData?: string | null;  // Original raw line from device (preserves MajorVer, MinorVer, etc.)
}

/**
 * Build a "DATA UPDATE USERINFO" command string.
 * Example output: DATA UPDATE USERINFO PIN=1001\tName=John\tPri=0\tCard=438854
 */
export function buildUserInfoCommand(
  uid: number,
  name: string,
  privilege: number = 0,
  card?: string | null,
  password?: string | null
): string {
  let cmd = `DATA UPDATE USERINFO PIN=${uid}\tName=${name}\tPri=${privilege}`;
  if (card) {
    cmd += `\tCard=${card}`;
  }
  if (password) {
    cmd += `\tPasswd=${password}`;
  }
  return cmd;
}

/**
 * Build a "DATA DELETE USERINFO" command string.
 * Example output: DATA DELETE USERINFO PIN=1001
 */
export function buildDeleteUserCommand(uid: number): string {
  return `DATA DELETE USERINFO PIN=${uid}`;
}

/**
 * Build a biometric update command.
 *
 * If `rawData` is available (preserved from the original device push), we replay it
 * exactly — this guarantees all device-specific fields (MajorVer, MinorVer, Format,
 * Duress, Index) are included without needing to store them individually.
 *
 * If `rawData` is NOT available (e.g., legacy records), we construct a best-effort
 * command using the fields we do have stored.
 */
export function buildBiometricCommand(bio: BiometricData): string {
  // If we have the raw line from the device, replay it exactly
  if (bio.rawData) {
    const trimmed = bio.rawData.trim();
    // The raw data starts with "BIODATA ..." or "FP PIN=..." etc.
    // We just prepend "DATA UPDATE " 
    if (trimmed.toUpperCase().startsWith('BIODATA ')) {
      return `DATA UPDATE ${trimmed}`;
    }
    // For fingerprint raw data that starts with "FP " or similar
    if (trimmed.toUpperCase().startsWith('FP ')) {
      return `DATA UPDATE ${trimmed}`;
    }
    // If it's already a full command format, use as-is with DATA UPDATE prefix
    return `DATA UPDATE ${trimmed}`;
  }

  // Fallback: construct from stored fields
  // Face templates (Type=9 or Type=15 mapped to face) use BIODATA table
  if (bio.type === 9 || bio.type === 15) {
    // For face: use BIODATA format with Type=9 (visible-light face)
    return [
      `DATA UPDATE BIODATA Pin=${bio.uid}`,
      `No=${bio.fingerId}`,
      `Index=0`,
      `Valid=${bio.valid}`,
      `Duress=0`,
      `Type=9`,
      `MajorVer=40`,
      `MinorVer=1`,
      `Format=0`,
      `Tmp=${bio.template}`,
    ].join('\t');
  }

  // Fingerprint templates use templatev10 table
  return [
    `DATA UPDATE templatev10 PIN=${bio.uid}`,
    `FingerID=${bio.fingerId}`,
    `Size=${bio.size}`,
    `Valid=${bio.valid}`,
    `Template=${bio.template}`,
  ].join('\t');
}
