require("dotenv").config({ path: "../../.env" });
const { PrismaClient } = require("@prisma/client");
const requireWorker = require("./dist/src/queue/worker");

async function check() {
    const prisma = new PrismaClient();
    try {
        const agents = await prisma.agent.findMany();
        console.log("=== AGENTS IN DATABASE ===");
        console.log(JSON.stringify(agents, null, 2));

        const IORedis = require("ioredis");
        const conn = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");
        const failedJobs = await conn.zrange("bull:agent-tasks:failed", 0, -1);

        console.log("\n=== FAILED JOBS ===");
        for (const jobId of failedJobs) {
            const jobData = await conn.hgetall(`bull:agent-tasks:${jobId}`);
            console.log(`Job ${jobId}:`);
            console.log(jobData.stacktrace);
        }
        process.exit(0);
    } catch (err) {
        console.error("Script error:", err);
        process.exit(1);
    }
}
check();
