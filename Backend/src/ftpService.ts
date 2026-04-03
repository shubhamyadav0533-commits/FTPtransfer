import SftpClient from "ssh2-sftp-client";
import path from "path";
import { SftpCredentials, FileEntry, FolderEntry } from "./types";

/**
 * The exact absolute path to the base uploads directory on the Hostinger server.
 */
const BASE_DIR = "/home/u608833076/domains/theclubfarm.in/public_html/uploads";

/**
 * Creates and connects an SFTP client with the given credentials.
 */
async function createSftpClient(credentials: SftpCredentials): Promise<SftpClient> {
  const client = new SftpClient();

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
 */
function getRemoteDir(folder: string): string {
  const clean = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.posix.join(BASE_DIR, clean);
}

/**
 * Builds the public URL for a file.
 */
function buildPublicUrl(credentials: SftpCredentials, folder: string, filename: string): string {
  const domain = credentials.domain.trim();
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  return `https://${cleanDomain}/uploads/${cleanFolder}/${encodeURIComponent(filename)}`;
}

/**
 * Uploads files to the remote server via SFTP.
 * Auto-creates the folder if it doesn't exist.
 * Returns public URLs for each uploaded file.
 */
export async function uploadFiles(
  credentials: SftpCredentials,
  files: Express.Multer.File[]
): Promise<string[]> {
  const folder = credentials.folder ?? "uploads";
  const client = await createSftpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    console.log(`[SFTP] Folder: "${folder}" → Remote dir: "${remoteDir}"`);

    // Ensure the target directory exists (creates it if not)
    await client.mkdir(remoteDir, true);

    const urls: string[] = [];

    for (const file of files) {
      const ext = path.posix.extname(file.originalname);
      const baseName = path.posix.basename(file.originalname, ext);
      const remoteFilename = `${baseName}_${Date.now()}${ext}`;
      const remotePath = path.posix.join(remoteDir, remoteFilename);

      // Upload from the buffer stored on disk by multer
      await client.put(file.path, remotePath);

      urls.push(buildPublicUrl(credentials, folder, remoteFilename));
    }

    return urls;
  } finally {
    await client.end();
  }
}

/**
 * Lists all files inside a folder on the remote server.
 * Does NOT create the folder — throws an error if it doesn't exist.
 */
export async function listFiles(
  credentials: SftpCredentials
): Promise<FileEntry[]> {
  const folder = credentials.folder ?? "uploads";
  const client = await createSftpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);

    // Check if the directory exists — do NOT auto-create
    const exists = await client.exists(remoteDir);
    if (!exists) {
      throw new Error(`Directory "${folder}" does not exist inside uploads.`);
    }

    const listing = await client.list(remoteDir);

    const files: FileEntry[] = listing
      .filter((item) => item.type === "-") // "-" = regular file in ssh2-sftp-client
      .map((item) => ({
        name: item.name,
        url: buildPublicUrl(credentials, folder, item.name),
        size: item.size,
      }));

    return files;
  } finally {
    await client.end();
  }
}

export async function listFolders(
  credentials: SftpCredentials
): Promise<FolderEntry[]> {
  const client = await createSftpClient(credentials);

  try {
    const exists = await client.exists(BASE_DIR);
    if (!exists) {
      throw new Error("uploads directory does not exist on the server. Please create it first.");
    }

    const listing = await client.list(BASE_DIR);

    const folders: FolderEntry[] = listing
      .filter((item) => item.type === "d") // "d" = directory
      .map((item) => ({
        name: item.name,
      }));

    return folders;
  } finally {
    await client.end();
  }
}

/**
 * Deletes a single file from a folder.
 */
export async function deleteFile(
  credentials: SftpCredentials,
  filename: string
): Promise<void> {
  const folder = credentials.folder ?? "uploads";
  const client = await createSftpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    const remotePath = path.posix.join(remoteDir, filename);

    const exists = await client.exists(remotePath);
    if (!exists) {
      throw new Error(`File "${filename}" not found in "${folder}".`);
    }

    await client.delete(remotePath);
    console.log(`[SFTP] Deleted file: ${remotePath}`);
  } finally {
    await client.end();
  }
}

/**
 * Deletes a folder and all its contents recursively.
 */
export async function deleteFolder(
  credentials: SftpCredentials,
  folderName: string
): Promise<void> {
  const client = await createSftpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folderName);

    const exists = await client.exists(remoteDir);
    if (!exists) {
      throw new Error(`Directory "${folderName}" does not exist inside uploads.`);
    }

    await client.rmdir(remoteDir, true); // true = recursive
    console.log(`[SFTP] Deleted folder: ${remoteDir}`);
  } finally {
    await client.end();
  }
}

/**
 * Renames a folder inside public_html.
 */
export async function renameFolder(
  credentials: SftpCredentials,
  oldName: string,
  newName: string
): Promise<void> {
  const client = await createSftpClient(credentials);

  try {
    const oldPath = getRemoteDir(oldName);
    const newPath = getRemoteDir(newName);

    const exists = await client.exists(oldPath);
    if (!exists) {
      throw new Error(`Directory "${oldName}" does not exist inside uploads.`);
    }

    const newExists = await client.exists(newPath);
    if (newExists) {
      throw new Error(`A directory named "${newName}" already exists.`);
    }

    await client.rename(oldPath, newPath);
    console.log(`[SFTP] Renamed folder: ${oldPath} → ${newPath}`);
  } finally {
    await client.end();
  }
}

/**
 * Renames a file inside a folder.
 */
export async function renameFile(
  credentials: SftpCredentials,
  oldFilename: string,
  newFilename: string
): Promise<void> {
  const folder = credentials.folder ?? "uploads";
  const client = await createSftpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    const oldPath = path.posix.join(remoteDir, oldFilename);
    const newPath = path.posix.join(remoteDir, newFilename);

    const exists = await client.exists(oldPath);
    if (!exists) {
      throw new Error(`File "${oldFilename}" not found in "${folder}".`);
    }

    const newExists = await client.exists(newPath);
    if (newExists) {
      throw new Error(`A file named "${newFilename}" already exists in "${folder}".`);
    }

    await client.rename(oldPath, newPath);
    console.log(`[SFTP] Renamed file: ${oldPath} → ${newPath}`);
  } finally {
    await client.end();
  }
}
