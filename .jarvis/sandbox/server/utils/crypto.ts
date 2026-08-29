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

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const GCM_IV_LENGTH = 12; // 96-bit IV standard for AES-GCM
const CBC_IV_LENGTH = 16;

/**
 * Chiffre une chaîne en utilisant AES-256-GCM (chiffrement authentifié).
 * Format de sortie : `gcm:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getMasterKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Déchiffre une chaîne chiffrée.
 * Supporte :
 * 1. AES-256-GCM (format `gcm:<iv>:<tag>:<ciphertext>`)
 * 2. Rétrocompatibilité AES-256-CBC (format `<iv>:<ciphertext>`)
 * 3. Fallback texte brut si le contenu n'est pas chiffré.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    // 1. Format AES-256-GCM : gcm:<iv>:<tag>:<ciphertext>
    if (encryptedText.startsWith('gcm:')) {
      const parts = encryptedText.split(':');
      if (parts.length === 4) {
        const ivHex = parts[1];
        const tagHex = parts[2];
        const cipherHex = parts[3];

        if (
          ivHex.length === GCM_IV_LENGTH * 2 &&
          tagHex.length === 32 &&
          /^[0-9a-fA-F]+$/.test(ivHex) &&
          /^[0-9a-fA-F]+$/.test(tagHex) &&
          /^[0-9a-fA-F]+$/.test(cipherHex)
        ) {
          const iv = Buffer.from(ivHex, 'hex');
          const authTag = Buffer.from(tagHex, 'hex');
          const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getMasterKey(), iv);
          decipher.setAuthTag(authTag);
          let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        }
      }
    }

    // 2. Rétrocompatibilité legacy AES-256-CBC : <iv_32chars>:<ciphertext>
    const parts = encryptedText.split(':');
    if (parts.length === 2) {
      if (parts[0].length === CBC_IV_LENGTH * 2 && /^[0-9a-fA-F]+$/.test(parts[0])) {
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(CBC_ALGORITHM, getMasterKey(), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    }

    return encryptedText;
  } catch {
    // Fallback texte brut si la clé a changé ou si le texte n'était pas chiffré
    return encryptedText;
  }
}
