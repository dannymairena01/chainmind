import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

export const healthRouter: Router = Router();

healthRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
    const health: Record<string, string> = {
        status: "ok",
        db: "unchecked",
        redis: "unchecked",
    };
    let httpStatus = 200;

    // ── Check PostgreSQL ───────────────────────────────────────────────────────
    try {
        await prisma.$queryRaw`SELECT 1`;
        health.db = "ok";
    } catch (err) {
        health.db = "error";
        health.status = "degraded";
        httpStatus = 503;
        console.error("[Health] DB check failed:", (err as Error).message);
    }

    // ── Check Redis ────────────────────────────────────────────────────────────
    try {
        const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
        const IORedis = (await import("ioredis")).default;
        const client = new IORedis(REDIS_URL, {
            maxRetriesPerRequest: 0,
            connectTimeout: 2000,
            lazyConnect: true,
        });
        await client.connect();
        await client.ping();
        await client.quit();
        health.redis = "ok";
    } catch (err) {
        health.redis = "error";
        health.status = "degraded";
        httpStatus = 503;
        console.error("[Health] Redis check failed:", (err as Error).message);
    }

    res.status(httpStatus).json(health);
});
