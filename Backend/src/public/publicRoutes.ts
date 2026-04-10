import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import SftpClient from "ssh2-sftp-client";

import { authMiddleware, getAuthContext } from "./authMiddleware";
import { generalLimiter, uploadLimiter } from "./rateLimiter";
import { logAudit } from "./auditLogger";
import { supabase } from "./supabaseClient";
import { sftpPool } from "./sftpPool";
import { uploadQueue } from "./uploadQueue";
import { deleteQueue } from "./deleteQueue";
import { encrypt, decrypt, hashApiKey, generateApiKey } from "./encryption";
import {
  validateFileContent,
  sanitizeFilename,
  getCategoryFromMime,
} from "./fileValidation";

import type {
  PublicApiResponse,
  PaginatedResponse,
  PublicFileRecord,
  PublicUserRecord,
  RegisterBody,
  CreateUserBody,
  ListFilesQuery,
  TenantRow,
  TenantUserRow,
  FileRow,
  UploadJobPayload,
  DecryptedSftpCredentials,
} from "./publicTypes";

const router = Router();

const USERS_BASE_DIR =
  "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/users";

// ─── Multer config for public uploads ────────────────────
const tmpDir = path.join(process.cwd(), "tmp_uploads");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const publicStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    cb(null, `pub_${Date.now()}_${file.originalname}`);
  },
});

const publicUpload = multer({
  storage: publicStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file
});

// ─── Helper: get category folder name ────────────────────
function getCategoryFolder(category: string): string {
  switch (category) {
    case "image":
      return "images";
    case "video":
      return "videos";
    default:
      return "documents";
  }
}

// ─── Helper: build public URL ────────────────────────────
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

// ─── Helper: get unique filename on SFTP ─────────────────
async function getUniqueRemoteFilename(
  client: SftpClient,
  remoteDir: string,
  filename: string
): Promise<string> {
  const ext = path.posix.extname(filename);
  const baseName = path.posix.basename(filename, ext);

  const firstPath = path.posix.join(remoteDir, filename);
  if (!(await client.exists(firstPath))) return filename;

  let counter = 1;
  while (counter < 1000) {
    const candidateName = `${baseName}(${counter})${ext}`;
    const candidatePath = path.posix.join(remoteDir, candidateName);
    if (!(await client.exists(candidatePath))) return candidateName;
    counter++;
  }

  return `${baseName}(${Date.now()})${ext}`;
}

// ─── Helper: clean up temp files ─────────────────────────
function cleanupTempFiles(files: Express.Multer.File[]): void {
  for (const file of files) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Already cleaned up
    }
  }
}

// ─── Helper: extract client IP ───────────────────────────
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? "unknown";
}

// ─── Helper: validate user belongs to tenant ─────────────
async function validateUser(
  tenantId: string,
  userId: string
): Promise<TenantUserRow | null> {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("*")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .single<TenantUserRow>();

  if (error || !data) return null;
  return data;
}

// ═══════════════════════════════════════════════════════════
// POST /register
// ═══════════════════════════════════════════════════════════
router.post(
  "/register",
  generalLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as RegisterBody;
      const { host, user, password, port, domain, email } = body;

      if (!host || !user || !password || !port || !domain) {
        const response: PublicApiResponse = {
          success: false,
          code: "REGISTRATION_FAILED",
          message:
            "Missing required fields: host, user, password, port, domain",
        };
        res.status(400).json(response);
        return;
      }

      const sftpPort = parseInt(port, 10);

      // 1. Validate SFTP credentials by connecting
      const credentials: DecryptedSftpCredentials = {
        host,
        username: user,
        password,
        port: sftpPort,
        domain,
      };

      let testClient: SftpClient;
      try {
        testClient = await sftpPool.createStandalone(credentials);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connection failed";
        const response: PublicApiResponse = {
          success: false,
          code: "REGISTRATION_FAILED",
          message: `SFTP connection failed: ${message}`,
        };
        res.status(400).json(response);
        return;
      }

      // 2. Create tenant in Supabase
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          email: email || null,
          sftp_host: encrypt(host),
          sftp_user: encrypt(user),
          sftp_password: encrypt(password),
          sftp_port: sftpPort,
          sftp_domain: domain,
          storage_used_bytes: 0,
          storage_limit_bytes: 16106127360, // 15 GB
        })
        .select()
        .single<TenantRow>();

      if (tenantError || !tenant) {
        await testClient.end();
        const response: PublicApiResponse = {
          success: false,
          code: "REGISTRATION_FAILED",
          message: `Failed to create tenant: ${tenantError?.message ?? "Unknown error"}`,
        };
        res.status(400).json(response);
        return;
      }

      // 3. Create tenant base folder on SFTP server
      const tenantDir = path.posix.join(USERS_BASE_DIR, tenant.id);
      try {
        await testClient.mkdir(tenantDir, true);
        console.log(`[Register] Created tenant folder: ${tenantDir}`);
      } catch (folderError) {
        await testClient.end();
        // Rollback tenant creation
        await supabase.from("tenants").delete().eq("id", tenant.id);
        const message =
          folderError instanceof Error
            ? folderError.message
            : "Folder creation failed";
        const response: PublicApiResponse = {
          success: false,
          code: "REGISTRATION_FAILED",
          message: `Failed to create folder structure: ${message}`,
        };
        res.status(400).json(response);
        return;
      }

      await testClient.end();

      // 4. Generate API key
      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 16); // pk_live_ + 8 chars

      const { error: keyError } = await supabase.from("api_keys").insert({
        tenant_id: tenant.id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label: "Default",
        is_active: true,
      });

      if (keyError) {
        const response: PublicApiResponse = {
          success: false,
          code: "REGISTRATION_FAILED",
          message: `Failed to generate API key: ${keyError.message}`,
        };
        res.status(500).json(response);
        return;
      }

      // 5. Audit log
      logAudit(tenant.id, "REGISTER", null, getClientIp(req));

      const response: PublicApiResponse<{
        api_key: string;
        tenant_id: string;
      }> = {
        success: true,
        message:
          "Registration successful. Save your API key — it will not be shown again.",
        data: {
          api_key: rawKey,
          tenant_id: tenant.id,
        },
      };
      res.status(201).json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message: `Registration failed: ${message}`,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// POST /regenerate-key
// ═══════════════════════════════════════════════════════════
router.post(
  "/regenerate-key",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      // Revoke all existing active keys for this tenant
      await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      // Generate new key
      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 16);

      const { error } = await supabase.from("api_keys").insert({
        tenant_id: tenantId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label: "Regenerated",
        is_active: true,
      });

      if (error) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to generate new key: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      logAudit(tenantId, "REGENERATE_KEY", null, ip);

      const response: PublicApiResponse<{ api_key: string }> = {
        success: true,
        message:
          "New API key generated. All previous keys have been revoked. Save this key — it will not be shown again.",
        data: { api_key: rawKey },
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// POST /revoke-key
// ═══════════════════════════════════════════════════════════
router.post(
  "/revoke-key",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      // Revoke ALL active keys for this tenant
      const { error } = await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (error) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to revoke keys: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      logAudit(tenantId, "REVOKE_KEY", null, ip);

      const response: PublicApiResponse = {
        success: true,
        message: "All API keys have been revoked.",
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// POST /public/users  (Create a sub-user)
// ═══════════════════════════════════════════════════════════
router.post(
  "/public/users",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, sftpCredentials } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      const body = req.body as CreateUserBody;

      if (!body.name || !body.email) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: "Missing required fields: name, email",
        };
        res.status(400).json(response);
        return;
      }

      // 1. Check if email exists in this tenant
      const { data: existingUser } = await supabase
        .from("tenant_users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", body.email)
        .single();

      if (existingUser) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `A user with email "${body.email}" already exists in your account.`,
        };
        res.status(409).json(response);
        return;
      }

      // 2. Create user record in Supabase
      const { data: user, error: userError } = await supabase
        .from("tenant_users")
        .insert({
          tenant_id: tenantId,
          name: body.name,
          email: body.email,
        })
        .select()
        .single<TenantUserRow>();

      if (userError || !user) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to create user: ${userError?.message ?? "Unknown error"}`,
        };
        res.status(500).json(response);
        return;
      }

      // 3. Create user folder structure on SFTP
      const userDir = path.posix.join(USERS_BASE_DIR, tenantId, user.id);
      let client: SftpClient | null = null;

      try {
        client = await sftpPool.acquire(tenantId, sftpCredentials);
        await client.mkdir(path.posix.join(userDir, "images"), true);
        await client.mkdir(path.posix.join(userDir, "videos"), true);
        await client.mkdir(path.posix.join(userDir, "documents"), true);
        console.log(`[Create User] Created folders for user: ${user.id}`);
      } catch (folderError) {
        // Rollback user creation
        await supabase.from("tenant_users").delete().eq("id", user.id);
        const message =
          folderError instanceof Error
            ? folderError.message
            : "Folder creation failed";
        const response: PublicApiResponse = {
          success: false,
          code: "SFTP_CONNECTION_FAILED",
          message: `Failed to create user folders: ${message}`,
        };
        res.status(500).json(response);
        return;
      } finally {
        if (client) sftpPool.release(tenantId, client);
      }

      logAudit(tenantId, "CREATE_USER", user.id, ip);

      const response: PublicApiResponse<{ user: PublicUserRecord }> = {
        success: true,
        message: `User "${body.name}" created successfully.`,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            created_at: user.created_at,
          },
        },
      };
      res.status(201).json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// GET /public/users  (List all sub-users)
// ═══════════════════════════════════════════════════════════
router.get(
  "/public/users",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getAuthContext(res);

    try {
      const { data: users, error } = await supabase
        .from("tenant_users")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to list users: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      const userRecords = (users as TenantUserRow[]).map(
        (u): PublicUserRecord => ({
          id: u.id,
          name: u.name,
          email: u.email,
          created_at: u.created_at,
        })
      );

      const response: PublicApiResponse<{ users: PublicUserRecord[] }> = {
        success: true,
        message: `Found ${userRecords.length} user(s).`,
        data: { users: userRecords },
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// DELETE /public/users/:id  (Delete a sub-user & all files)
// ═══════════════════════════════════════════════════════════
router.delete(
  "/public/users/:id",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, sftpCredentials } = getAuthContext(res);
    const ip = getClientIp(req);
    const userId = req.params.id as string;

    try {
      // Verify user belongs to this tenant
      const user = await validateUser(tenantId, userId as string);
      if (!user) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_NOT_FOUND",
          message: "User not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      // 1. Get total size of user's files for storage counter update
      const { data: userFiles } = await supabase
        .from("files")
        .select("size_bytes")
        .eq("user_id", userId);

      const totalBytes = (userFiles ?? []).reduce(
        (sum: number, f: { size_bytes: number }) => sum + f.size_bytes,
        0
      );

      const { tenant } = getAuthContext(res); // Needs the encrypted credentials from original tenant record
      
      // 2. Enqueue background job to delete user's folder recursively from SFTP
      await deleteQueue.add(`delete-user-${tenantId}-${userId}-${Date.now()}`, {
        tenantId,
        userId,
        encryptedHost: tenant.sftp_host,
        encryptedUser: tenant.sftp_user,
        encryptedPassword: tenant.sftp_password,
        sftpPort: tenant.sftp_port,
        sftpDomain: tenant.sftp_domain,
      });

      // 3. Delete user from Supabase (cascade deletes files too)
      const { error } = await supabase
        .from("tenant_users")
        .delete()
        .eq("id", userId);

      if (error) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to delete user: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      // 4. Decrement storage
      if (totalBytes > 0) {
        await supabase.rpc("increment_storage", {
          p_tenant_id: tenantId,
          p_bytes: -totalBytes,
        });
      }

      logAudit(tenantId, "DELETE_USER", userId as string, ip);

      const response: PublicApiResponse = {
        success: true,
        message: `User "${user.name}" and all their files have been deleted.`,
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// POST /public/upload  (async — BullMQ queue)
// Requires: user_id in body
// ═══════════════════════════════════════════════════════════
router.post(
  "/public/upload",
  generalLimiter,
  uploadLimiter,
  authMiddleware,
  publicUpload.array("files", 20),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, tenant } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      const userId = req.body.user_id as string | undefined;

      if (!userId) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_REQUIRED",
          message: "Missing required field: user_id. Every upload must specify which user the file belongs to.",
        };
        res.status(400).json(response);
        return;
      }

      // Verify user belongs to this tenant
      const user = await validateUser(tenantId, userId);
      if (!user) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_NOT_FOUND",
          message: "User not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        const response: PublicApiResponse = {
          success: false,
          code: "INVALID_FILE_TYPE",
          message: "No files provided.",
        };
        res.status(400).json(response);
        return;
      }

      // Validate each file
      const jobIds: string[] = [];

      for (const file of files) {
        // 1. Validate file content (magic bytes)
        const validation = await validateFileContent(file.path);
        if (!validation.valid) {
          cleanupTempFiles(files);
          const response: PublicApiResponse = {
            success: false,
            code: "INVALID_FILE_TYPE",
            message: `File "${file.originalname}" has unsupported content type: ${validation.detectedMime}`,
          };
          res.status(400).json(response);
          return;
        }

        // 2. Sanitize filename
        const sanitized = sanitizeFilename(file.originalname);
        if (!sanitized) {
          cleanupTempFiles(files);
          const response: PublicApiResponse = {
            success: false,
            code: "INVALID_FILENAME",
            message: `File "${file.originalname}" has an invalid filename.`,
          };
          res.status(400).json(response);
          return;
        }

        // 3. Check storage quota
        const projectedUsage = tenant.storage_used_bytes + file.size;
        if (projectedUsage > tenant.storage_limit_bytes) {
          cleanupTempFiles(files);
          const response: PublicApiResponse = {
            success: false,
            code: "QUOTA_EXCEEDED",
            message: `Storage quota exceeded. Used: ${tenant.storage_used_bytes} bytes, Limit: ${tenant.storage_limit_bytes} bytes.`,
          };
          res.status(413).json(response);
          return;
        }

        // 4. Determine category from detected MIME
        const category = getCategoryFromMime(validation.detectedMime);

        // 5. Enqueue upload job
        const jobPayload: UploadJobPayload = {
          tenantId,
          userId,
          filePath: file.path,
          originalFilename: file.originalname,
          sanitizedFilename: sanitized,
          sizeBytes: file.size,
          mimeType: validation.detectedMime,
          fileCategory: category,
          encryptedHost: tenant.sftp_host,
          encryptedUser: tenant.sftp_user,
          encryptedPassword: tenant.sftp_password,
          sftpPort: tenant.sftp_port,
          sftpDomain: tenant.sftp_domain,
        };

        const job = await uploadQueue.add(
          `upload-${tenantId}-${userId}-${Date.now()}`,
          jobPayload
        );

        jobIds.push(job.id ?? "unknown");
      }

      logAudit(
        tenantId,
        "UPLOAD",
        `${files.length} file(s) queued for user ${userId}`,
        ip
      );

      const response: PublicApiResponse<{ job_ids: string[] }> = {
        success: true,
        message: `${files.length} file(s) queued for upload. Check GET /files?user_id=${userId} to see when they appear.`,
        data: { job_ids: jobIds },
      };
      res.status(202).json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      logAudit(tenantId, "UPLOAD", null, ip, "SFTP_UPLOAD_FAILED");
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message: `Upload failed: ${message}`,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// POST /public/upload/sync  (synchronous upload)
// Requires: user_id in body
// ═══════════════════════════════════════════════════════════
router.post(
  "/public/upload/sync",
  generalLimiter,
  uploadLimiter,
  authMiddleware,
  publicUpload.array("files", 20),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, tenant, sftpCredentials } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      const userId = req.body.user_id as string | undefined;

      if (!userId) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_REQUIRED",
          message: "Missing required field: user_id. Every upload must specify which user the file belongs to.",
        };
        res.status(400).json(response);
        return;
      }

      // Verify user belongs to this tenant
      const user = await validateUser(tenantId, userId);
      if (!user) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_NOT_FOUND",
          message: "User not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        const response: PublicApiResponse = {
          success: false,
          code: "INVALID_FILE_TYPE",
          message: "No files provided.",
        };
        res.status(400).json(response);
        return;
      }

      const uploadedFiles: PublicFileRecord[] = [];
      let client: SftpClient | null = null;

      try {
        client = await sftpPool.acquire(tenantId, sftpCredentials);

        for (const file of files) {
          // 1. Validate magic bytes
          const validation = await validateFileContent(file.path);
          if (!validation.valid) {
            cleanupTempFiles(files);
            const response: PublicApiResponse = {
              success: false,
              code: "INVALID_FILE_TYPE",
              message: `File "${file.originalname}" has unsupported content type: ${validation.detectedMime}`,
            };
            res.status(400).json(response);
            return;
          }

          // 2. Sanitize filename
          const sanitized = sanitizeFilename(file.originalname);

          // 3. Check quota
          const projectedUsage = tenant.storage_used_bytes + file.size;
          if (projectedUsage > tenant.storage_limit_bytes) {
            cleanupTempFiles(files);
            const response: PublicApiResponse = {
              success: false,
              code: "QUOTA_EXCEEDED",
              message: "Storage quota exceeded.",
            };
            res.status(413).json(response);
            return;
          }

          // 4. Determine category & remote directory
          const category = getCategoryFromMime(validation.detectedMime);
          const categoryFolder = getCategoryFolder(category);
          const remoteDir = path.posix.join(
            USERS_BASE_DIR,
            tenantId,
            userId,
            categoryFolder
          );

          // 5. Ensure directory exists
          await client.mkdir(remoteDir, true);

          // 6. Generate unique filename & upload
          const uniqueName = await getUniqueRemoteFilename(
            client,
            remoteDir,
            sanitized
          );
          const remotePath = path.posix.join(remoteDir, uniqueName);
          await client.put(file.path, remotePath);

          // 7. Build public URL
          const publicUrl = buildPublicUrl(
            sftpCredentials.domain,
            tenantId,
            userId,
            categoryFolder,
            uniqueName
          );

          // 8. Insert into Supabase
          const { data: fileRecord, error: dbError } = await supabase
            .from("files")
            .insert({
              tenant_id: tenantId,
              user_id: userId,
              filename: uniqueName,
              original_filename: file.originalname,
              public_url: publicUrl,
              size_bytes: file.size,
              mime_type: validation.detectedMime,
              file_category: category,
            })
            .select()
            .single<FileRow>();

          if (dbError || !fileRecord) {
            // Orphan cleanup
            try {
              await client.delete(remotePath);
            } catch {
              console.error(
                `[Sync Upload] Orphan cleanup failed: ${remotePath}`
              );
            }
            throw new Error(
              `Database insert failed: ${dbError?.message ?? "Unknown"}`
            );
          }

          // 9. Update storage
          await supabase.rpc("increment_storage", {
            p_tenant_id: tenantId,
            p_bytes: file.size,
          });

          uploadedFiles.push({
            id: fileRecord.id,
            user_id: fileRecord.user_id,
            filename: fileRecord.filename,
            original_filename: fileRecord.original_filename,
            public_url: fileRecord.public_url,
            size_bytes: fileRecord.size_bytes,
            mime_type: fileRecord.mime_type,
            file_category: fileRecord.file_category,
            created_at: fileRecord.created_at,
          });
        }
      } finally {
        if (client) {
          sftpPool.release(tenantId, client);
        }
        cleanupTempFiles(files);
      }

      logAudit(
        tenantId,
        "UPLOAD",
        `${uploadedFiles.length} file(s) uploaded for user ${userId}`,
        ip
      );

      const response: PublicApiResponse<{ files: PublicFileRecord[] }> = {
        success: true,
        message: `Successfully uploaded ${uploadedFiles.length} file(s).`,
        data: { files: uploadedFiles },
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      logAudit(tenantId, "UPLOAD", null, ip, "SFTP_UPLOAD_FAILED");
      const response: PublicApiResponse = {
        success: false,
        code: "SFTP_UPLOAD_FAILED",
        message: `Upload failed: ${message}`,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// GET /public/files
// Requires: user_id query param
// ═══════════════════════════════════════════════════════════
router.get(
  "/public/files",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getAuthContext(res);
    const ip = getClientIp(req);

    try {
      const query = req.query as ListFilesQuery;

      if (!query.user_id) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_REQUIRED",
          message: "Missing required query parameter: user_id.",
        };
        res.status(400).json(response);
        return;
      }

      // Verify user belongs to this tenant
      const user = await validateUser(tenantId, query.user_id);
      if (!user) {
        const response: PublicApiResponse = {
          success: false,
          code: "USER_NOT_FOUND",
          message: "User not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      const page = Math.max(1, parseInt(query.page ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10)));
      const offset = (page - 1) * limit;

      // Build Supabase query scoped to user
      let dbQuery = supabase
        .from("files")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("user_id", query.user_id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (query.category) {
        dbQuery = dbQuery.eq("file_category", query.category);
      }

      if (query.search) {
        dbQuery = dbQuery.ilike("filename", `%${query.search}%`);
      }

      const { data: files, error, count } = await dbQuery;

      if (error) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to list files: ${error.message}`,
        };
        res.status(500).json(response);
        return;
      }

      const fileRecords = (files as FileRow[]).map(
        (f): PublicFileRecord => ({
          id: f.id,
          user_id: f.user_id,
          filename: f.filename,
          original_filename: f.original_filename,
          public_url: f.public_url,
          size_bytes: f.size_bytes,
          mime_type: f.mime_type,
          file_category: f.file_category,
          created_at: f.created_at,
        })
      );

      const total = count ?? 0;

      logAudit(tenantId, "LIST", `user=${query.user_id} page=${page} limit=${limit}`, ip);

      const response: PaginatedResponse<PublicFileRecord> = {
        success: true,
        message: `Found ${total} file(s).`,
        data: fileRecords,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// GET /public/files/:id
// ═══════════════════════════════════════════════════════════
router.get(
  "/public/files/:id",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = getAuthContext(res);
    const fileId = req.params.id as string;
    
    // Accept user_id from query params (?user_id=)
    const userId = req.query.user_id as string | undefined;

    if (!userId) {
      const response: PublicApiResponse = {
        success: false,
        code: "USER_REQUIRED",
        message: "Missing required query parameter: user_id.",
      };
      res.status(400).json(response);
      return;
    }

    try {
      const { data: file, error: fetchError } = await supabase
        .from("files")
        .select("*")
        .eq("id", fileId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single<FileRow>();

      if (fetchError || !file) {
        const response: PublicApiResponse = {
          success: false,
          code: "FILE_NOT_FOUND",
          message: "File not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      const fileRecord: PublicFileRecord = {
        id: file.id,
        user_id: file.user_id,
        filename: file.filename,
        original_filename: file.original_filename,
        public_url: file.public_url,
        size_bytes: file.size_bytes,
        mime_type: file.mime_type,
        file_category: file.file_category,
        created_at: file.created_at,
      };

      const response: PublicApiResponse<{ file: PublicFileRecord }> = {
        success: true,
        message: "File retrieved successfully.",
        data: { file: fileRecord },
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// DELETE /public/files/:id
// ═══════════════════════════════════════════════════════════
router.delete(
  "/public/files/:id",
  generalLimiter,
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, sftpCredentials } = getAuthContext(res);
    const ip = getClientIp(req);
    const fileId = req.params.id as string;
    
    // Accept user_id from either query params (?user_id=) or JSON body
    const userId = (req.query.user_id || req.body.user_id) as string | undefined;

    if (!userId) {
      const response: PublicApiResponse = {
        success: false,
        code: "USER_REQUIRED",
        message: "Missing required parameter: user_id. You must specify the owner to delete this file.",
      };
      res.status(400).json(response);
      return;
    }

    try {
      // 1. Look up the file and verify ownership
      const { data: file, error: fetchError } = await supabase
        .from("files")
        .select("*")
        .eq("id", fileId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .single<FileRow>();

      if (fetchError || !file) {
        const response: PublicApiResponse = {
          success: false,
          code: "FILE_NOT_FOUND",
          message: "File not found or does not belong to your account.",
        };
        res.status(404).json(response);
        return;
      }

      // 2. Delete from SFTP server
      const categoryFolder = getCategoryFolder(file.file_category);
      const remotePath = path.posix.join(
        USERS_BASE_DIR,
        tenantId,
        file.user_id,
        categoryFolder,
        file.filename
      );

      let client: SftpClient | null = null;
      try {
        client = await sftpPool.acquire(tenantId, sftpCredentials);
        const exists = await client.exists(remotePath);
        if (exists) {
          await client.delete(remotePath);
        }
      } catch (sftpError) {
        console.warn(
          `[Delete] SFTP delete failed for ${remotePath}:`,
          sftpError
        );
        // Continue to delete DB record even if SFTP fails
      } finally {
        if (client) {
          sftpPool.release(tenantId, client);
        }
      }

      // 3. Delete from Supabase
      const { error: deleteError } = await supabase
        .from("files")
        .delete()
        .eq("id", fileId);

      if (deleteError) {
        const response: PublicApiResponse = {
          success: false,
          code: "INTERNAL_ERROR",
          message: `Failed to delete file record: ${deleteError.message}`,
        };
        res.status(500).json(response);
        return;
      }

      // 4. Decrement storage used
      await supabase.rpc("increment_storage", {
        p_tenant_id: tenantId,
        p_bytes: -file.size_bytes,
      });

      logAudit(tenantId, "DELETE", file.filename, ip);

      const response: PublicApiResponse = {
        success: true,
        message: `Successfully deleted "${file.original_filename}".`,
      };
      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const response: PublicApiResponse = {
        success: false,
        code: "INTERNAL_ERROR",
        message,
      };
      res.status(500).json(response);
    }
  }
);

export default router;
