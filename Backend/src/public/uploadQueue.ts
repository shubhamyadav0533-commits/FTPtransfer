import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import SftpClient from "ssh2-sftp-client";
import path from "path";
import fs from "fs";
import "dotenv/config";
import type { UploadJobPayload, FileRow } from "./publicTypes";
import { decrypt } from "./encryption";
import { sftpPool } from "./sftpPool";
import { supabase } from "./supabaseClient";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const USERS_BASE_DIR =
  "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/users";

/** Shared Redis connection for BullMQ */
const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

/** The upload job queue */
export const uploadQueue = new Queue<UploadJobPayload>("file-uploads", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 },   // Keep completed jobs for 24 hours
    removeOnFail: { age: 604800 },      // Keep failed jobs for 7 days
  },
});

/**
 * Builds the public URL for a file in the /users/ structure.
 */
function buildPublicUrl(
  domain: string,
  tenantId: string,
  userId: string,
  categoryFolder: string,
  filename: string
): string {
  const cleanDomain = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `https://${cleanDomain}/users/${tenantId}/${userId}/${categoryFolder}/${encodeURIComponent(filename)}`;
}

/**
 * Maps file_category to the server folder name.
 */
function getCategoryFolder(category: string): string {
  switch (category) {
    case "image":
      return "images";
    case "video":
      return "videos";
    case "document":
      return "documents";
    default:
      return "documents";
  }
}

/**
 * Generates a unique filename if a file with the same name already exists.
 */
async function getUniqueRemoteFilename(
  client: SftpClient,
  remoteDir: string,
  filename: string
): Promise<string> {
  const ext = path.posix.extname(filename);
  const baseName = path.posix.basename(filename, ext);

  const firstPath = path.posix.join(remoteDir, filename);
  const firstExists = await client.exists(firstPath);
  if (!firstExists) return filename;

  let counter = 1;
  while (counter < 1000) {
    const candidateName = `${baseName}(${counter})${ext}`;
    const candidatePath = path.posix.join(remoteDir, candidateName);
    const candidateExists = await client.exists(candidatePath);
    if (!candidateExists) return candidateName;
    counter++;
  }

  return `${baseName}(${Date.now()})${ext}`;
}

/**
 * BullMQ Worker — processes upload jobs with concurrency of 5.
 */
export const uploadWorker = new Worker<UploadJobPayload>(
  "file-uploads",
  async (job: Job<UploadJobPayload>) => {
    const payload = job.data;

    // Decrypt SFTP credentials
    const credentials = {
      host: decrypt(payload.encryptedHost),
      username: decrypt(payload.encryptedUser),
      password: decrypt(payload.encryptedPassword),
      port: payload.sftpPort,
      domain: payload.sftpDomain,
    };

    const categoryFolder = getCategoryFolder(payload.fileCategory);
    const remoteDir = path.posix.join(
      USERS_BASE_DIR,
      payload.tenantId,
      payload.userId,
      categoryFolder
    );

    let client;
    let uploadedFilename: string | null = null;
    let remotePath: string | null = null;

    try {
      // Acquire pooled SFTP connection
      client = await sftpPool.acquire(payload.tenantId, credentials);

      // Ensure target directory exists
      await client.mkdir(remoteDir, true);

      // Generate unique filename
      uploadedFilename = await getUniqueRemoteFilename(
        client,
        remoteDir,
        payload.sanitizedFilename
      );
      remotePath = path.posix.join(remoteDir, uploadedFilename);

      // Upload the file
      await client.put(payload.filePath, remotePath);

      console.log(`[Upload Worker] Uploaded: ${remotePath}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown SFTP error";
      throw new Error(`SFTP upload failed: ${message}`);
    } finally {
      if (client) {
        sftpPool.release(payload.tenantId, client);
      }
    }

    // Build public URL
    const publicUrl = buildPublicUrl(
      payload.sftpDomain,
      payload.tenantId,
      payload.userId,
      categoryFolder,
      uploadedFilename
    );

    // Insert file record into Supabase
    const fileRecord: Omit<FileRow, "id" | "created_at"> = {
      tenant_id: payload.tenantId,
      user_id: payload.userId,
      filename: uploadedFilename,
      original_filename: payload.originalFilename,
      public_url: publicUrl,
      size_bytes: payload.sizeBytes,
      mime_type: payload.mimeType,
      file_category: payload.fileCategory,
    };

    const { error: dbError } = await supabase
      .from("files")
      .insert(fileRecord);

    if (dbError) {
      // ─── Orphan cleanup: delete the file we just uploaded ───
      console.error(
        `[Upload Worker] DB insert failed, cleaning orphan: ${remotePath}`
      );
      try {
        const cleanupClient = await sftpPool.acquire(
          payload.tenantId,
          credentials
        );
        await cleanupClient.delete(remotePath);
        sftpPool.release(payload.tenantId, cleanupClient);
      } catch (cleanupError) {
        console.error(
          "[Upload Worker] Orphan cleanup failed:",
          cleanupError
        );
      }
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    // Update storage used
    const { error: storageError } = await supabase.rpc("increment_storage", {
      p_tenant_id: payload.tenantId,
      p_bytes: payload.sizeBytes,
    });

    if (storageError) {
      console.warn(
        "[Upload Worker] Failed to update storage counter:",
        storageError.message
      );
    }

    // Clean up temp file
    try {
      fs.unlinkSync(payload.filePath);
    } catch {
      // Already cleaned up — ignore
    }

    return { publicUrl, filename: uploadedFilename };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

// Log worker events
uploadWorker.on("completed", (job) => {
  console.log(`[Upload Worker] Job ${job.id} completed`);
});

uploadWorker.on("failed", (job, err) => {
  console.error(`[Upload Worker] Job ${job?.id} failed: ${err.message}`);
});
