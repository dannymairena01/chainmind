import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { agentsRouter } from "./routes/agents";
import { healthRouter } from "./routes/health";
import { startWorker } from "./queue/worker";
import { validateEnv } from "./lib/validateEnv";

dotenv.config({ path: "../../.env" });

// Validate all critical environment variables before starting the server
validateEnv();

const app: express.Application = express();
const PORT = Number(process.env["PORT"] ?? 3001);

// ─── Middleware ────────────────────────────────────────────────────────────────
// L-6: helmet sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, etc.) — must come before cors and routes.
app.use(helmet());

const FRONTEND_URL = process.env["NEXT_PUBLIC_FRONTEND_URL"] ?? "http://localhost:3000";

app.use(cors({
    origin: [FRONTEND_URL],
    credentials: true,
}));
app.use(express.json());

// Global rate limiter — applied ONLY to mutating routes (POST/PUT/DELETE/PATCH)
// GET routes (including /health and GET /agents) are intentionally exempt to
// avoid rate-limiting users who have the dashboard + agent detail page polling simultaneously.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: (req) => req.method === "GET" || req.method === "HEAD",
});

app.use(apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/agents", agentsRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
    const server = app.listen(PORT, () => {
        console.log(`[ChainMind Agent Runtime] listening on http://localhost:${PORT}`);
        // Start BullMQ worker AFTER HTTP server is up, so Redis errors
        // don't prevent the server from starting in stub mode.
        try {
            startWorker();
        } catch (err) {
            console.warn("[Worker] Could not start BullMQ worker (Redis unavailable):", err);
        }
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    // On SIGTERM/SIGINT (issued during deploys or container restarts), stop
    // accepting new requests and give in-flight jobs time to complete before exit.
    const shutdown = (signal: string) => {
        console.log(`[Server] ${signal} received. Shutting down gracefully…`);
        server.close(() => {
            console.log("[Server] HTTP server closed.");
            // Prisma and BullMQ worker have their own teardown handled by the OS
            // closing the process. In a future iteration, call worker.close() here.
            process.exit(0);
        });

        // Force-exit after 10s if something hangs
        setTimeout(() => {
            console.error("[Server] Forced exit after timeout.");
            process.exit(1);
        }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
