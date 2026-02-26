import { Request, Response, NextFunction } from "express";
import { PrivyClient } from "@privy-io/server-auth";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    console.warn("⚠️ Missing Privy App ID or Secret. Authentication disabled.");
}

const privy = new PrivyClient(
    PRIVY_APP_ID || "mock-app-id",
    PRIVY_APP_SECRET || "mock-app-secret"
);

// Extend Express Request object to include the verified user
export interface AuthenticatedRequest extends Request {
    user?: {
        privyUserId: string;
        privyId: string;
    };
}

export const requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // ─── Bypass in Test Environment ───────────────────────────────────────────
    if (process.env.NODE_ENV === "test") {
        if (!req.headers.authorization) {
            res.status(401).json({ error: "Unauthorized access token" });
            return;
        }

        req.user = {
            privyUserId: "0x123",
            privyId: "did:privy:123",
        };
        next();
        return;
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            res.status(401).json({ error: "Missing or invalid authorization token" });
            return;
        }

        const token = authHeader.replace("Bearer ", "");
        const verifiedClaims = await privy.verifyAuthToken(token);

        // Inject the verified claims into the request for downstream routes
        req.user = {
            privyId: verifiedClaims.userId,
            privyUserId:
                // We map the Privy DID back to the original EVM wallet if available
                verifiedClaims.userId?.replace("did:privy:", "") || "",
        };

        next();
    } catch (err) {
        console.error("[Privy Auth Error]", err);
        res.status(401).json({ error: "Invalid or expired token" });
    }
};
