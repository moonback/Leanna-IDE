import crypto from 'crypto';
import os from 'os';

// Derive a key from machine info + optional env master key
function getMasterKey(): Buffer {
  const envKey = process.env.JARVIS_MASTER_KEY || '';
  // Combine hostname, platform, and username for a stable machine-specific seed
  let userInfo = '';
  try {
    userInfo = os.userInfo().username;
  } catch {
    // fallback if os.userInfo() fails (e.g. in some limited permission environments)
    userInfo = 'default-user';
  }
  const machineSeed = `${os.hostname()}-${os.platform()}-${userInfo}`;
  const rawSecret = envKey + machineSeed;
  // Hash to get a 32-byte key
  return crypto.createHash('sha256').update(rawSecret).digest();
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return encryptedText; // Fallback to raw text if not encrypted format
    
    // Simple validation of the IV (first part should be hex and length 32 in string hex format)
    if (parts[0].length !== 32 || !/^[0-9a-fA-F]+$/.test(parts[0])) {
      return encryptedText;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // If decryption fails, it might be unencrypted raw text
    return encryptedText;
  }
}
