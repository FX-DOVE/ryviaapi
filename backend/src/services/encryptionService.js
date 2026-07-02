/**
 * encryptionService.js
 *
 * AES-256-GCM encryption/decryption for API keys stored in the database.
 * Keys are NEVER stored in plaintext. Decryption only happens at call-time.
 *
 * Required env var:
 *   PROVIDER_ENCRYPTION_KEY  — 64 hex characters (= 32 bytes)
 *   Generate with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

function getKey() {
  const keyHex = process.env.PROVIDER_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "<iv_hex>:<encrypted_hex>:<tag_hex>" — safe to store in DB
 */
export function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * @param {string} ciphertext  "<iv_hex>:<encrypted_hex>:<tag_hex>"
 * @returns {string}  original plaintext
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return '';
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format — expected iv:encrypted:tag');
  }

  const iv        = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const tag       = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mask an API key for safe display in API responses.
 * Returns "••••••••<last4>" or "••••" if the key is too short.
 * @param {string} plaintext  — the decrypted key
 * @returns {string}
 */
export function maskKey(plaintext) {
  if (!plaintext || plaintext.length < 5) return '••••';
  return `••••••••${plaintext.slice(-4)}`;
}

export default { encrypt, decrypt, maskKey };
