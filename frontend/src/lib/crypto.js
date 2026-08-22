/**
 * Client-Side AES-GCM 256 Cryptographic Engine
 * Provides End-to-End Encryption and Decryption for User-Admin Chat Messages.
 */

const DEFAULT_SHARED_SALT = "mova_transit_e2ee_salt_v1";
const DEFAULT_ROOM_SECRET = "mova_secure_transit_channel_2026";

/**
 * Derives a CryptoKey from a secret passphrase and salt using PBKDF2
 */
async function deriveKey(secret = DEFAULT_ROOM_SECRET, salt = DEFAULT_SHARED_SALT) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypts a plaintext string using AES-GCM 256
 * @param {string} plaintext - Message text to encrypt
 * @param {string} [passphrase] - Optional custom channel passphrase
 * @returns {Promise<{ciphertext: string, iv: string, algorithm: string}>}
 */
export async function encryptMessage(plaintext, passphrase = DEFAULT_ROOM_SECRET) {
  try {
    if (!plaintext || typeof plaintext !== "string") {
      throw new Error("Invalid plaintext");
    }

    const key = await deriveKey(passphrase);
    const enc = new TextEncoder();
    const encodedText = enc.encode(plaintext);

    // 12-byte initialization vector recommended for AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encodedText
    );

    return {
      ciphertext: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv),
      algorithm: "AES-GCM-256"
    };
  } catch (err) {
    console.error("Encryption error:", err);
    throw err;
  }
}

/**
 * Decrypts an AES-GCM ciphertext payload into plaintext
 * @param {string} ciphertext - Base64 encoded ciphertext
 * @param {string} iv - Base64 encoded IV
 * @param {string} [passphrase] - Optional channel passphrase
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decryptMessage(ciphertext, iv, passphrase = DEFAULT_ROOM_SECRET) {
  try {
    if (!ciphertext || !iv) return "[Empty or Corrupted Message]";

    const key = await deriveKey(passphrase);
    const cipherBuffer = base64ToArrayBuffer(ciphertext);
    const ivBuffer = base64ToArrayBuffer(iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer)
      },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    // If decryption fails, return a safe indicator
    return "[🔒 Encrypted Message - Decryption Key Mismatch]";
  }
}
