import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { FtpCredentials, UploadResponse, FilesResponse } from "./types";
import { uploadFiles, listFiles } from "./ftpService";

const router = Router();

// Configure multer to store files temporarily
const tmpDir = path.join(process.cwd(), "tmp_uploads");
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/bmp",
      "image/tiff",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/upload
 * Upload images via FTP to the remote server.
 */
router.post(
  "/upload",
  upload.array("files", 20),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { host, user, password, port, domain, folder } = req.body as Record<string, string>;

      if (!host || !user || !password || !port || !domain || !folder) {
        res.status(400).json({
          success: false,
          urls: [],
          message: "Missing required fields (host, user, password, port, domain, folder)",
        } satisfies UploadResponse);
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          urls: [],
          message: "No files provided",
        } satisfies UploadResponse);
        return;
      }

      const credentials: FtpCredentials = {
        host,
        user,
        password,
        port: parseInt(port, 10),
        domain,
        folder,
      };

      const urls = await uploadFiles(credentials, files);

      // Clean up temp files
      for (const file of files) {
        fs.unlink(file.path, () => {});
      }

      res.json({
        success: true,
        urls,
        message: `Successfully uploaded ${urls.length} file(s)`,
      } satisfies UploadResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        success: false,
        urls: [],
        message: `Upload failed: ${message}`,
      } satisfies UploadResponse);
    }
  }
);

/**
 * POST /api/files
 * List all files in the uploads directory and return public URLs.
 */
router.post("/files", async (req: Request, res: Response): Promise<void> => {
  try {
    const { host, user, password, port, domain, folder } = req.body as Record<string, string>;

    if (!host || !user || !password || !port || !domain || !folder) {
      res.status(400).json({
        success: false,
        files: [],
        message: "Missing required fields (host, user, password, port, domain, folder)",
      } satisfies FilesResponse);
      return;
    }

    const credentials: FtpCredentials = {
      host,
      user,
      password,
      port: parseInt(port, 10),
      domain,
      folder,
    };

    const files = await listFiles(credentials);

    res.json({
      success: true,
      files,
      message: `Found ${files.length} file(s)`,
    } satisfies FilesResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    res.status(500).json({
      success: false,
      files: [],
      message: `Failed to list files: ${message}`,
    } satisfies FilesResponse);
  }
});

export default router;
