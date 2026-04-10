import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import SftpClient from "ssh2-sftp-client";
import path from "path";
import "dotenv/config";
import type { DeleteJobPayload } from "./publicTypes";
import { decrypt } from "./encryption";
import { sftpPool } from "./sftpPool";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const USERS_BASE_DIR =
  "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/users";

/** Shared Redis connection for BullMQ */
const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

/** The user deletion queue */
export const deleteQueue = new Queue<DeleteJobPayload>("user-deletes", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 },   // Keep completed jobs for 24 hours
    removeOnFail: { age: 604800 },      // Keep failed jobs for 7 days
  },
});

/**
 * BullMQ Worker — processes background folder deletions over SFTP.
 */
export const deleteWorker = new Worker<DeleteJobPayload>(
  "user-deletes",
  async (job: Job<DeleteJobPayload>) => {
    const payload = job.data;

    // Decrypt SFTP credentials
    const credentials = {
      host: decrypt(payload.encryptedHost),
      username: decrypt(payload.encryptedUser),
      password: decrypt(payload.encryptedPassword),
      port: payload.sftpPort,
      domain: payload.sftpDomain,
    };

    const userDir = path.posix.join(
      USERS_BASE_DIR,
      payload.tenantId,
      payload.userId
    );

    let client: SftpClient | null = null;

    try {
      // Acquire pooled SFTP connection
      client = await sftpPool.acquire(payload.tenantId, credentials);

      const exists = await client.exists(userDir);
      if (exists) {
        // Recursive delete
        await client.rmdir(userDir, true);
        console.log(`[Delete Worker] Deleted folder natively: ${userDir}`);
      } else {
        console.log(`[Delete Worker] Folder already missing: ${userDir}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown SFTP error";
      throw new Error(`SFTP rmdir failed: ${message}`);
    } finally {
      if (client) {
        sftpPool.release(payload.tenantId, client);
      }
    }

    return { deletedPath: userDir };
  },
  {
    connection: redisConnection,
    concurrency: 2, // No need for massive concurrency for deletes
  }
);

// Log worker events
deleteWorker.on("completed", (job) => {
  console.log(`[Delete Worker] Job ${job.id} completed. User ${job.data.userId} folders wiped.`);
});

deleteWorker.on("failed", (job, err) => {
  console.error(`[Delete Worker] Job ${job?.id} failed: ${err.message}`);
});
