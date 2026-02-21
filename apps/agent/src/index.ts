import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { agentsRouter } from "./routes/agents";
import { healthRouter } from "./routes/health";
import { startWorker } from "./queue/worker";

dotenv.config();

const app = express();
const PORT = Number(process.env["PORT"] ?? 3001);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/agents", agentsRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
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

export default app;
