"use strict";
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
const ssh2_sftp_client_1 = __importDefault(require("ssh2-sftp-client"));
const path_1 = __importDefault(require("path"));
/**
 * The absolute path to the base directory on the GoDaddy server.
 * Fill this in when you have the actual server path.
 */
const GODADDY_BASE_DIR = "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/uploads";
/**
 * Creates and connects an SFTP client with the given credentials.
 */
async function createSftpClient(credentials) {
    const client = new ssh2_sftp_client_1.default();
    await client.connect({
        host: credentials.host,
        port: credentials.port,
        username: credentials.user,
        password: credentials.password,
        tryKeyboard: true,
        retries: 2,
        retry_minTimeout: 2000,
    });
    return client;
}
/**
 * Builds the remote directory path from the folder name.
 * Unlike Hostinger, no character sanitization — folder names are used as-is.
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
 * Generates a file-explorer-style unique filename.
 * e.g. file.pdf → file.pdf, file(1).pdf, file(2).pdf ...
 */
async function getUniqueFilename(client, remoteDir, originalName) {
    const ext = path_1.default.posix.extname(originalName);
    const baseName = path_1.default.posix.basename(originalName, ext);
    // Try the original name first
    const firstPath = path_1.default.posix.join(remoteDir, originalName);
    const firstExists = await client.exists(firstPath);
    if (!firstExists)
        return originalName;
    // Try file(1).ext, file(2).ext, etc.
    let counter = 1;
    while (counter < 1000) {
        const candidateName = `${baseName}(${counter})${ext}`;
        const candidatePath = path_1.default.posix.join(remoteDir, candidateName);
        const candidateExists = await client.exists(candidatePath);
        if (!candidateExists)
            return candidateName;
        counter++;
    }
    // Fallback: extremely unlikely
    return `${baseName}(${Date.now()})${ext}`;
}
/**
 * Uploads files to the remote server via SFTP.
 * Uses file-explorer-style naming: file, file(1), file(2) ...
 * Auto-creates the folder if it doesn't exist.
 */
async function uploadFiles(credentials, files) {
    const folder = credentials.folder ?? "uploads";
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        console.log(`[GoDaddy SFTP] Folder: "${folder}" → Remote dir: "${remoteDir}"`);
        // Ensure the target directory exists
        await client.mkdir(remoteDir, true);
        const urls = [];
        for (const file of files) {
            const remoteFilename = await getUniqueFilename(client, remoteDir, file.originalname);
            const remotePath = path_1.default.posix.join(remoteDir, remoteFilename);
            await client.put(file.path, remotePath);
            urls.push(buildPublicUrl(credentials, folder, remoteFilename));
        }
        return urls;
    }
    finally {
        await client.end();
    }
}
/**
 * Lists all files inside a folder on the remote server.
 */
async function listFiles(credentials) {
    const folder = credentials.folder ?? "uploads";
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const exists = await client.exists(remoteDir);
        if (!exists) {
            throw new Error(`Directory "${folder}" does not exist.`);
        }
        const listing = await client.list(remoteDir);
        const files = listing
            .filter((item) => item.type === "-")
            .map((item) => ({
            name: item.name,
            url: buildPublicUrl(credentials, folder, item.name),
            size: item.size,
        }));
        return files;
    }
    finally {
        await client.end();
    }
}
/**
 * Lists all folders inside the base directory.
 */
async function listFolders(credentials) {
    const client = await createSftpClient(credentials);
    try {
        const exists = await client.exists(GODADDY_BASE_DIR);
        if (!exists) {
            throw new Error("Base directory does not exist on the server. Please create it first.");
        }
        const listing = await client.list(GODADDY_BASE_DIR);
        const folders = listing
            .filter((item) => item.type === "d")
            .map((item) => ({
            name: item.name,
        }));
        return folders;
    }
    finally {
        await client.end();
    }
}
/**
 * Creates an empty folder inside the base directory.
 */
async function createFolder(credentials, folderName) {
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folderName);
        const exists = await client.exists(remoteDir);
        if (exists) {
            throw new Error(`A folder named "${folderName}" already exists.`);
        }
        await client.mkdir(remoteDir, true);
        console.log(`[GoDaddy SFTP] Created folder: ${remoteDir}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Deletes a single file from a folder.
 */
async function deleteFile(credentials, filename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const remotePath = path_1.default.posix.join(remoteDir, filename);
        const exists = await client.exists(remotePath);
        if (!exists) {
            throw new Error(`File "${filename}" not found in "${folder}".`);
        }
        await client.delete(remotePath);
        console.log(`[GoDaddy SFTP] Deleted file: ${remotePath}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Deletes a folder and all its contents recursively.
 */
async function deleteFolder(credentials, folderName) {
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folderName);
        const exists = await client.exists(remoteDir);
        if (!exists) {
            throw new Error(`Directory "${folderName}" does not exist.`);
        }
        await client.rmdir(remoteDir, true);
        console.log(`[GoDaddy SFTP] Deleted folder: ${remoteDir}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Renames a folder inside the base directory.
 */
async function renameFolder(credentials, oldName, newName) {
    const client = await createSftpClient(credentials);
    try {
        const oldPath = getRemoteDir(oldName);
        const newPath = getRemoteDir(newName);
        const exists = await client.exists(oldPath);
        if (!exists) {
            throw new Error(`Directory "${oldName}" does not exist.`);
        }
        const newExists = await client.exists(newPath);
        if (newExists) {
            throw new Error(`A directory named "${newName}" already exists.`);
        }
        await client.rename(oldPath, newPath);
        console.log(`[GoDaddy SFTP] Renamed folder: ${oldPath} → ${newPath}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Renames a file inside a folder.
 */
async function renameFile(credentials, oldFilename, newFilename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const oldPath = path_1.default.posix.join(remoteDir, oldFilename);
        const newPath = path_1.default.posix.join(remoteDir, newFilename);
        const exists = await client.exists(oldPath);
        if (!exists) {
            throw new Error(`File "${oldFilename}" not found in "${folder}".`);
        }
        const newExists = await client.exists(newPath);
        if (newExists) {
            throw new Error(`A file named "${newFilename}" already exists in "${folder}".`);
        }
        await client.rename(oldPath, newPath);
        console.log(`[GoDaddy SFTP] Renamed file: ${oldPath} → ${newPath}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Moves a file from one folder to another.
 * This is effectively a rename across directories in SFTP.
 */
async function moveFile(credentials, sourceFolder, targetFolder, filename) {
    const client = await createSftpClient(credentials);
    try {
        const sourceDir = getRemoteDir(sourceFolder);
        const targetDir = getRemoteDir(targetFolder);
        const sourcePath = path_1.default.posix.join(sourceDir, filename);
        // Verify source file exists
        const sourceExists = await client.exists(sourcePath);
        if (!sourceExists) {
            throw new Error(`File "${filename}" not found in "${sourceFolder}".`);
        }
        // Verify target directory exists
        const targetExists = await client.exists(targetDir);
        if (!targetExists) {
            throw new Error(`Target directory "${targetFolder}" does not exist.`);
        }
        // Generate unique name in the target folder (file-explorer style)
        const uniqueName = await getUniqueFilename(client, targetDir, filename);
        const targetPath = path_1.default.posix.join(targetDir, uniqueName);
        await client.rename(sourcePath, targetPath);
        console.log(`[GoDaddy SFTP] Moved file: ${sourcePath} → ${targetPath}`);
    }
    finally {
        await client.end();
    }
}
/**
 * Downloads a file from the remote server and returns it as a Buffer.
 */
async function downloadFile(credentials, filename) {
    const folder = credentials.folder ?? "uploads";
    const client = await createSftpClient(credentials);
    try {
        const remoteDir = getRemoteDir(folder);
        const remotePath = path_1.default.posix.join(remoteDir, filename);
        const exists = await client.exists(remotePath);
        if (!exists) {
            throw new Error(`File "${filename}" not found in "${folder}".`);
        }
        const data = await client.get(remotePath);
        console.log(`[GoDaddy SFTP] Downloaded file: ${remotePath}`);
        // ssh2-sftp-client.get() returns Buffer | string | Writable
        if (Buffer.isBuffer(data)) {
            return data;
        }
        if (typeof data === "string") {
            return Buffer.from(data);
        }
        throw new Error("Unexpected response type from SFTP get");
    }
    finally {
        await client.end();
    }
}
//# sourceMappingURL=goDaddyFtpService.js.map