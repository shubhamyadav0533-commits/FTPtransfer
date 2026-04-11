import crypto from "crypto";
import "dotenv/config";

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

let ENCRYPTION_KEY: Buffer | null = null;

if (ENCRYPTION_KEY_HEX && ENCRYPTION_KEY_HEX.length === 64) {
  ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

const IV_LENGTH = 16; // AES block size

/**
 * Encrypts a plaintext string using AES-256-CBC.
 * Returns a string in the format `iv_hex:ciphertext_hex`.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with `encrypt()`.
 * Expects the `iv_hex:ciphertext_hex` format.
 */
export function decrypt(ciphertext: string): string {
  const [ivHex, encryptedHex] = ciphertext.split(":");

  if (!ivHex || !encryptedHex) {
    throw new Error("Invalid ciphertext format. Expected 'iv:ciphertext'.");
  }

  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Produces a SHA-256 hex digest of the raw API key.
 * This is a one-way hash — the original key cannot be recovered.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generates a cryptographically secure API key with a `pk_live_` prefix.
 * Total length: 8 (prefix) + 40 (random hex) = 48 characters.
 */
export function generateApiKey(): string {
  const randomPart = crypto.randomBytes(20).toString("hex"); // 40 hex chars
  return `pk_live_${randomPart}`;
}
