import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// Require the key to be exactly 64 hex characters (= 32 raw bytes for AES-256).
// Using a hex-encoded key prevents the silent truncation bug where a long ASCII
// key would have its entropy halved by .slice(0, 32).
const _rawKey = process.env["ENCRYPTION_KEY"];

if (!_rawKey) {
    throw new Error("CRITICAL: ENCRYPTION_KEY environment variable is not set.");
}

const ENCRYPTION_KEY_BUF = Buffer.from(_rawKey, "hex");

if (ENCRYPTION_KEY_BUF.length !== 32) {
    throw new Error(
        `CRITICAL: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
        `Got ${_rawKey.length} chars → ${ENCRYPTION_KEY_BUF.length} bytes. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a hex string in the format: iv:authTag:encryptedData
 */
export function encryptJSON(text: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV is standard for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY_BUF, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a hex string (iv:authTag:encryptedData) back to plaintext.
 */
export function decryptJSON(encryptedFormat: string): string {
    // Use a limit of 3 so a ':' inside the ciphertext portion is preserved
    const colonIdx1 = encryptedFormat.indexOf(":");
    const colonIdx2 = encryptedFormat.indexOf(":", colonIdx1 + 1);

    if (colonIdx1 === -1 || colonIdx2 === -1) {
        throw new Error("Invalid encryption format. Expected iv:authTag:encrypted");
    }

    const ivHex = encryptedFormat.slice(0, colonIdx1);
    const authTagHex = encryptedFormat.slice(colonIdx1 + 1, colonIdx2);
    const encryptedHex = encryptedFormat.slice(colonIdx2 + 1);

    if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error("Invalid encryption format. Expected iv:authTag:encrypted");
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        ENCRYPTION_KEY_BUF,
        Buffer.from(ivHex, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
