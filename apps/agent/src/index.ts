import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { agentsRouter } from "./routes/agents";
import { healthRouter } from "./routes/health";
import { startWorker } from "./queue/worker";

dotenv.config({ path: "../../.env" });

const app: express.Application = express();
const PORT = Number(process.env["PORT"] ?? 3001);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: "Too many requests, please try again later." },
});

app.use(apiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/agents", agentsRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
        console.log(`[ChainMind Agent Runtime] listening on http://localhost:${PORT}`);
        // Start BullMQ worker AFTER HTTP server is up, so Redis errors
        // don't prevent the server from starting in stub mode.
        try {
            startWorker();
        } catch (err) {
            console.warn("[Worker] Could not start BullMQ worker (Redis unavailable):", err);
        }
    });
}

export default app;
