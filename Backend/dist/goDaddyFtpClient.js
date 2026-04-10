"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFiles = uploadFiles;
exports.listFiles = listFiles;
exports.listFolders = listFolders;
exports.createFolder = createFolder;
exports.deleteFile = deleteFile;
exports.deleteFolder = deleteFolder;
exports.renameFolder = renameFolder;
exports.renameFile = renameFile;
exports.moveFile = moveFile;
exports.downloadFile = downloadFile;
const ftp = __importStar(require("basic-ftp"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * The absolute path to the base directory on the GoDaddy server.
 */
const GODADDY_BASE_DIR = "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/uploads";
/**
 * Creates and connects an FTP client with the given credentials.
 */
async function createFtpClient(credentials) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    await client.access({
        host: credentials.host,
        port: credentials.port,
        user: credentials.user,
        password: credentials.password,
        secure: false,
    });
    return client;
}
/**
 * Builds the remote directory path from the folder name.
 */
function getRemoteDir(folder) {
    return path_1.default.posix.join(GODADDY_BASE_DIR, folder);
}
/**
 * Builds the public URL for a file.
 */
function buildPublicUrl(credentials, folder, filename) {
    const domain = credentials.domain.trim();
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${cleanDomain}/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
}
/**
 * Checks if a file exists on the FTP server.
 */
async function ftpFileExists(client, remotePath) {
    try {
        await client.size(remotePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Checks if a directory exists on the FTP server.
 */
async function ftpDirExists(client, remotePath) {
    const currentDir = await client.pwd();
    try {
        await client.cd(remotePath);
        await client.cd(currentDir);
        return true;
    }
    catch {
        try {
            await client.cd(currentDir);
        }
        catch { /* ignore */ }
        return false;
    }
}
/**
 * Generates a file-explorer-style unique filename.
 * e.g. file.pdf → file.pdf, file(1).pdf, file(2).pdf ...
 */
async function getUniqueFilename(client, remoteDir, originalName) {
    const ext = path_1.default.posix.extname(originalName);
    const baseName = path_1.default.posix.basename(originalName, ext);
    const firstPath = path_1.default.posix.join(remoteDir, originalName);
    if (!(await ftpFileExists(client, firstPath)))
        return originalName;
    let counter = 1;
    while (counter < 1000) {
        const candidateName = `${baseName}(${counter})${ext}`;
        const candidatePath = path_1.default.posix.join(remoteDir, candidateName);
        if (!(await ftpFileExists(client, candidatePath)))
            return candidateName;
        counter++;
    }
    return `${baseName}(${Date.now()})${ext}`;
}
/**
 * Uploads files to the remote server via FTP.
 */
async function uploadFiles(credentials, files) {
    const folder = credentials.folder ?? "uploads";
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        console.log(`[GoDaddy FTP] Folder: "${folder}" → Remote dir: "${remoteDir}"`);
        await client.ensureDir(remoteDir);
        const urls = [];
        for (const file of files) {
            const remoteFilename = await getUniqueFilename(client, remoteDir, file.originalname);
            const remotePath = path_1.default.posix.join(remoteDir, remoteFilename);
            await client.uploadFrom(file.path, remotePath);
            urls.push(buildPublicUrl(credentials, folder, remoteFilename));
        }
        return urls;
    }
    finally {
        client.close();
    }
}
/**
 * Lists all files inside a folder on the remote server via FTP.
 */
async function listFiles(credentials) {
    const folder = credentials.folder ?? "uploads";
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        if (!(await ftpDirExists(client, remoteDir))) {
            throw new Error(`Directory "${folder}" does not exist.`);
        }
        const listing = await client.list(remoteDir);
        const files = listing
            .filter((item) => item.type === ftp.FileType.File)
            .map((item) => ({
            name: item.name,
            url: buildPublicUrl(credentials, folder, item.name),
            size: item.size,
        }));
        return files;
    }
    finally {
        client.close();
    }
}
/**
 * Lists all folders inside the base directory via FTP.
 */
async function listFolders(credentials) {
    const client = await createFtpClient(credentials);
    try {
        if (!(await ftpDirExists(client, GODADDY_BASE_DIR))) {
            throw new Error("Base directory does not exist on the server. Please create it first.");
        }
        const listing = await client.list(GODADDY_BASE_DIR);
        const folders = listing
            .filter((item) => item.type === ftp.FileType.Directory)
            .map((item) => ({
            name: item.name,
        }));
        return folders;
    }
    finally {
        client.close();
    }
}
/**
 * Creates an empty folder inside the base directory via FTP.
 */
async function createFolder(credentials, folderName) {
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folderName);
        if (await ftpDirExists(client, remoteDir)) {
            throw new Error(`A folder named "${folderName}" already exists.`);
        }
        await client.ensureDir(remoteDir);
        console.log(`[GoDaddy FTP] Created folder: ${remoteDir}`);
    }
    finally {
        client.close();
    }
}
/**
 * Deletes a single file from a folder via FTP.
 */
async function deleteFile(credentials, filename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const remotePath = path_1.default.posix.join(remoteDir, filename);
        if (!(await ftpFileExists(client, remotePath))) {
            throw new Error(`File "${filename}" not found in "${folder}".`);
        }
        await client.remove(remotePath);
        console.log(`[GoDaddy FTP] Deleted file: ${remotePath}`);
    }
    finally {
        client.close();
    }
}
/**
 * Deletes a folder and all its contents recursively via FTP.
 */
async function deleteFolder(credentials, folderName) {
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folderName);
        if (!(await ftpDirExists(client, remoteDir))) {
            throw new Error(`Directory "${folderName}" does not exist.`);
        }
        await client.removeDir(remoteDir);
        console.log(`[GoDaddy FTP] Deleted folder: ${remoteDir}`);
    }
    finally {
        client.close();
    }
}
/**
 * Renames a folder inside the base directory via FTP.
 */
async function renameFolder(credentials, oldName, newName) {
    const client = await createFtpClient(credentials);
    try {
        const oldPath = getRemoteDir(oldName);
        const newPath = getRemoteDir(newName);
        if (!(await ftpDirExists(client, oldPath))) {
            throw new Error(`Directory "${oldName}" does not exist.`);
        }
        if (await ftpDirExists(client, newPath)) {
            throw new Error(`A directory named "${newName}" already exists.`);
        }
        await client.rename(oldPath, newPath);
        console.log(`[GoDaddy FTP] Renamed folder: ${oldPath} → ${newPath}`);
    }
    finally {
        client.close();
    }
}
/**
 * Renames a file inside a folder via FTP.
 */
async function renameFile(credentials, oldFilename, newFilename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const oldPath = path_1.default.posix.join(remoteDir, oldFilename);
        const newPath = path_1.default.posix.join(remoteDir, newFilename);
        if (!(await ftpFileExists(client, oldPath))) {
            throw new Error(`File "${oldFilename}" not found in "${folder}".`);
        }
        if (await ftpFileExists(client, newPath)) {
            throw new Error(`A file named "${newFilename}" already exists in "${folder}".`);
        }
        await client.rename(oldPath, newPath);
        console.log(`[GoDaddy FTP] Renamed file: ${oldPath} → ${newPath}`);
    }
    finally {
        client.close();
    }
}
/**
 * Moves a file from one folder to another via FTP.
 */
async function moveFile(credentials, sourceFolder, targetFolder, filename) {
    const client = await createFtpClient(credentials);
    try {
        const sourceDir = getRemoteDir(sourceFolder);
        const targetDir = getRemoteDir(targetFolder);
        const sourcePath = path_1.default.posix.join(sourceDir, filename);
        if (!(await ftpFileExists(client, sourcePath))) {
            throw new Error(`File "${filename}" not found in "${sourceFolder}".`);
        }
        if (!(await ftpDirExists(client, targetDir))) {
            throw new Error(`Target directory "${targetFolder}" does not exist.`);
        }
        const uniqueName = await getUniqueFilename(client, targetDir, filename);
        const targetPath = path_1.default.posix.join(targetDir, uniqueName);
        await client.rename(sourcePath, targetPath);
        console.log(`[GoDaddy FTP] Moved file: ${sourcePath} → ${targetPath}`);
    }
    finally {
        client.close();
    }
}
/**
 * Downloads a file from the remote server via FTP and returns it as a Buffer.
 */
async function downloadFile(credentials, filename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createFtpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const remotePath = path_1.default.posix.join(remoteDir, filename);
        if (!(await ftpFileExists(client, remotePath))) {
            throw new Error(`File "${filename}" not found in "${folder}".`);
        }
        // Download to a temp file, then read into buffer
        const tmpPath = path_1.default.join(process.cwd(), "tmp_uploads", `dl_${Date.now()}_${filename}`);
        await client.downloadTo(tmpPath, remotePath);
        const data = fs_1.default.readFileSync(tmpPath);
        fs_1.default.unlinkSync(tmpPath);
        console.log(`[GoDaddy FTP] Downloaded file: ${remotePath}`);
        return data;
    }
    finally {
        client.close();
    }
}
//# sourceMappingURL=goDaddyFtpClient.js.map