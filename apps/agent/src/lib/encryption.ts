import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = process.env["ENCRYPTION_KEY"] || "00000000000000000000000000000000"; // 32 bytes

if (!process.env["ENCRYPTION_KEY"]) {
    console.warn("[Encryption] WARNING: ENCRYPTION_KEY is not set in environment. Using insecure default. DO NOT USE IN PRODUCTION.");
}

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
