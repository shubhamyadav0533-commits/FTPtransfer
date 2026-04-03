"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ftpService_1 = require("./ftpService");
const router = (0, express_1.Router)();
// Configure multer to store files temporarily
const tmpDir = path_1.default.join(process.cwd(), "tmp_uploads");
if (!fs_1.default.existsSync(tmpDir)) {
    fs_1.default.mkdirSync(tmpDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename: (_req, file, cb) => {
        const ext = file.originalname.substring(file.originalname.lastIndexOf('.'));
        const baseName = file.originalname.substring(0, file.originalname.lastIndexOf('.'));
        const uniqueName = `${baseName}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
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
        }
        else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    },
});
/**
 * Helper to extract base SFTP credentials from request body.
 */
function extractCredentials(body) {
    const { host, user, password, port, domain } = body;
    if (!host || !user || !password || !port || !domain)
        return null;
    return {
        host,
        user,
        password,
        port: parseInt(port, 10),
        domain,
        folder: body.folder || undefined,
    };
}
/**
 * POST /api/upload
 * Upload images via SFTP to the remote server.
 */
router.post("/upload", upload.array("files", 20), async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        if (!credentials || !credentials.folder) {
            res.status(400).json({
                success: false,
                urls: [],
                message: "Missing required fields (host, user, password, port, domain, folder)",
            });
            return;
        }
        const files = req.files;
        if (!files || files.length === 0) {
            res.status(400).json({
                success: false,
                urls: [],
                message: "No files provided",
            });
            return;
        }
        const urls = await (0, ftpService_1.uploadFiles)(credentials, files);
        // Clean up temp files
        for (const file of files) {
            fs_1.default.unlink(file.path, () => { });
        }
        res.json({
            success: true,
            urls,
            message: `Successfully uploaded ${urls.length} file(s)`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            urls: [],
            message: `Upload failed: ${message}`,
        });
    }
});
/**
 * POST /api/files
 * List all files in a folder and return public URLs.
 */
router.post("/files", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        if (!credentials || !credentials.folder) {
            res.status(400).json({
                success: false,
                files: [],
                message: "Missing required fields (host, user, password, port, domain, folder)",
            });
            return;
        }
        const files = await (0, ftpService_1.listFiles)(credentials);
        res.json({
            success: true,
            files,
            message: `Found ${files.length} file(s)`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            files: [],
            message: `Failed to list files: ${message}`,
        });
    }
});
/**
 * POST /api/folders
 * List all folders inside public_html.
 */
router.post("/folders", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        if (!credentials) {
            res.status(400).json({
                success: false,
                folders: [],
                message: "Missing required fields (host, user, password, port, domain)",
            });
            return;
        }
        const folders = await (0, ftpService_1.listFolders)(credentials);
        res.json({
            success: true,
            folders,
            message: `Found ${folders.length} folder(s)`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            folders: [],
            message: `Failed to list folders: ${message}`,
        });
    }
});
/**
 * DELETE /api/file
 * Delete a specific file from a folder.
 */
router.delete("/file", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        const filename = body.filename;
        if (!credentials || !credentials.folder || !filename) {
            res.status(400).json({
                success: false,
                message: "Missing required fields (host, user, password, port, domain, folder, filename)",
            });
            return;
        }
        await (0, ftpService_1.deleteFile)(credentials, filename);
        res.json({
            success: true,
            message: `Successfully deleted "${filename}"`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            message: `Failed to delete file: ${message}`,
        });
    }
});
/**
 * DELETE /api/folder
 * Delete a folder and all its contents.
 */
router.delete("/folder", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        const folderName = body.folderName;
        if (!credentials || !folderName) {
            res.status(400).json({
                success: false,
                message: "Missing required fields (host, user, password, port, domain, folderName)",
            });
            return;
        }
        await (0, ftpService_1.deleteFolder)(credentials, folderName);
        res.json({
            success: true,
            message: `Successfully deleted folder "${folderName}" and all its contents`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            message: `Failed to delete folder: ${message}`,
        });
    }
});
/**
 * PATCH /api/folder
 * Rename a folder inside public_html.
 */
router.patch("/folder", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        const oldName = body.oldName;
        const newName = body.newName;
        if (!credentials || !oldName || !newName) {
            res.status(400).json({
                success: false,
                message: "Missing required fields (host, user, password, port, domain, oldName, newName)",
            });
            return;
        }
        await (0, ftpService_1.renameFolder)(credentials, oldName, newName);
        res.json({
            success: true,
            message: `Successfully renamed folder "${oldName}" to "${newName}"`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            message: `Failed to rename folder: ${message}`,
        });
    }
});
/**
 * PATCH /api/file
 * Rename a file inside a folder.
 */
router.patch("/file", async (req, res) => {
    try {
        const body = req.body;
        const credentials = extractCredentials(body);
        const oldName = body.oldName;
        const newName = body.newName;
        if (!credentials || !credentials.folder || !oldName || !newName) {
            res.status(400).json({
                success: false,
                message: "Missing required fields (host, user, password, port, domain, folder, oldName, newName)",
            });
            return;
        }
        await (0, ftpService_1.renameFile)(credentials, oldName, newName);
        res.json({
            success: true,
            message: `Successfully renamed file "${oldName}" to "${newName}"`,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        res.status(500).json({
            success: false,
            message: `Failed to rename file: ${message}`,
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map