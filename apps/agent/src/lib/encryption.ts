import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const _cryptoKey = process.env["ENCRYPTION_KEY"];

if (!_cryptoKey || _cryptoKey.length < 32) {
    throw new Error("CRITICAL: ENCRYPTION_KEY is required and must be at least 32 characters long.");
}

const ENCRYPTION_KEY = _cryptoKey as string;

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a hex string in the format: iv:authTag:encryptedData
 */
export function encryptJSON(text: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV is standard for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a hex string (iv:authTag:encryptedData) back to plaintext.
 */
export function decryptJSON(encryptedFormat: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedFormat.split(":");

    if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error("Invalid encryption format. Expected iv:authTag:encrypted");
    }

    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
        Buffer.from(ivHex, "hex")
    );

    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
