import dotenv from "dotenv";

export function validateEnv() {
    // Skip validation entirely in test mode — env vars are intentionally absent
    if (process.env.NODE_ENV === "test") return;

    // Only load dotenv if we are not in a production environment where vars are injected
    if (process.env.NODE_ENV !== "production") {
        dotenv.config();
    }

    const requiredVars = [
        "DATABASE_URL",
        "ENCRYPTION_KEY",
        "PRIVATE_KEY",
        // CDP uses CDP_API_KEY_ID / CDP_API_KEY_SECRET (aligned with worker.ts)
        "CDP_API_KEY_ID",
        "CDP_API_KEY_SECRET",
        "OPENAI_API_KEY",
        "NEXT_PUBLIC_PRIVY_APP_ID",
        "PRIVY_APP_SECRET",
        "REDIS_URL",
        // CORS origin — must be set so the frontend isn't silently blocked in prod
        "NEXT_PUBLIC_FRONTEND_URL",
    ];

    const missingVars = requiredVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
        console.error("❌ CRITICAL ERROR: Missing required environment variables:");
        missingVars.forEach(envVar => console.error(`   - ${envVar}`));
        console.error("Server refuses to start. Please map these variables in your environment.");
        process.exit(1);
    }

    // ENCRYPTION_KEY must be exactly 64 hex characters (= 32 raw bytes for AES-256-GCM).
    // Generate a valid key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    const encKey = process.env.ENCRYPTION_KEY;
    if (encKey) {
        if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
            console.error(
                "❌ CRITICAL ERROR: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).\n" +
                "   Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
            );
            process.exit(1);
        }
    }

    console.log("✅ Environment validation passed.");
}
