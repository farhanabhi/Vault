/**
 * VaultCrypto — thin wrapper around the native Web Crypto API.
 * Everything here runs locally in the browser. Nothing is ever transmitted.
 *
 * Key derivation: PBKDF2-SHA256 -> AES-GCM 256 (non-extractable CryptoKey)
 * Encryption:      AES-GCM, random 96-bit IV per operation
 */
(function (global) {
  'use strict';

  const PBKDF2_ITERATIONS = 250000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;

  function randomBytes(len) {
    return crypto.getRandomValues(new Uint8Array(len));
  }

  function newSalt() {
    return randomBytes(SALT_BYTES);
  }

  /**
   * Derive a non-extractable AES-GCM CryptoKey from a passphrase/PIN + salt.
   * @param {string} secret
   * @param {Uint8Array} salt
   * @param {number} [iterations]
   * @returns {Promise<CryptoKey>}
   */
  async function deriveKey(secret, salt, iterations) {
    iterations = iterations || PBKDF2_ITERATIONS;
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a JS value (JSON-serialised) or raw binary with AES-GCM.
   * @param {CryptoKey} key
   * @param {*} value - plain object/string (JSON-encoded) OR ArrayBuffer/TypedArray (raw)
   * @param {boolean} [isRaw] - true if `value` is already binary
   * @returns {Promise<{iv: Uint8Array, data: ArrayBuffer}>}
   */
  async function encrypt(key, value, isRaw) {
    const iv = randomBytes(IV_BYTES);
    let plainBuf;
    if (isRaw) {
      plainBuf = value instanceof ArrayBuffer ? value : value.buffer;
    } else {
      plainBuf = new TextEncoder().encode(JSON.stringify(value));
    }
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuf);
    return { iv, data };
  }

  /**
   * Decrypt AES-GCM ciphertext produced by encrypt().
   * @param {CryptoKey} key
   * @param {Uint8Array} iv
   * @param {ArrayBuffer} cipherBuf
   * @param {boolean} [isRaw] - true to return raw ArrayBuffer instead of parsed JSON
   * @returns {Promise<*>}
   */
  async function decrypt(key, iv, cipherBuf, isRaw) {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    if (isRaw) return plainBuf;
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  // --- base64 helpers (only needed for JSON export/import of backups) ---

  function bufToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  global.VaultCrypto = {
    PBKDF2_ITERATIONS,
    newSalt,
    randomBytes,
    deriveKey,
    encrypt,
    decrypt,
    bufToBase64,
    base64ToBuf
  };
})(window);
