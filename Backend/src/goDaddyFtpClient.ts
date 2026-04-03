import * as ftp from "basic-ftp";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { SftpCredentials, FileEntry, FolderEntry } from "./types";

/**
 * The absolute path to the base directory on the GoDaddy server.
 */
const GODADDY_BASE_DIR = "/home/afpsx7bu0o7r/public_html/brijvrindafarms.in/uploads";

/**
 * Creates and connects an FTP client with the given credentials.
 */
async function createFtpClient(credentials: SftpCredentials): Promise<ftp.Client> {
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
function getRemoteDir(folder: string): string {
  return path.posix.join(GODADDY_BASE_DIR, folder);
}

/**
 * Builds the public URL for a file.
 */
function buildPublicUrl(credentials: SftpCredentials, folder: string, filename: string): string {
  const domain = credentials.domain.trim();
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${cleanDomain}/uploads/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
}

/**
 * Checks if a file exists on the FTP server.
 */
async function ftpFileExists(client: ftp.Client, remotePath: string): Promise<boolean> {
  try {
    await client.size(remotePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a directory exists on the FTP server.
 */
async function ftpDirExists(client: ftp.Client, remotePath: string): Promise<boolean> {
  const currentDir = await client.pwd();
  try {
    await client.cd(remotePath);
    await client.cd(currentDir);
    return true;
  } catch {
    try { await client.cd(currentDir); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Generates a file-explorer-style unique filename.
 * e.g. file.pdf → file.pdf, file(1).pdf, file(2).pdf ...
 */
async function getUniqueFilename(
  client: ftp.Client,
  remoteDir: string,
  originalName: string
): Promise<string> {
  const ext = path.posix.extname(originalName);
  const baseName = path.posix.basename(originalName, ext);

  const firstPath = path.posix.join(remoteDir, originalName);
  if (!(await ftpFileExists(client, firstPath))) return originalName;

  let counter = 1;
  while (counter < 1000) {
    const candidateName = `${baseName}(${counter})${ext}`;
    const candidatePath = path.posix.join(remoteDir, candidateName);
    if (!(await ftpFileExists(client, candidatePath))) return candidateName;
    counter++;
  }

  return `${baseName}(${Date.now()})${ext}`;
}

/**
 * Uploads files to the remote server via FTP.
 */
export async function uploadFiles(
  credentials: SftpCredentials,
  files: Express.Multer.File[]
): Promise<string[]> {
  const folder = credentials.folder ?? "uploads";
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    console.log(`[GoDaddy FTP] Folder: "${folder}" → Remote dir: "${remoteDir}"`);

    await client.ensureDir(remoteDir);

    const urls: string[] = [];

    for (const file of files) {
      const remoteFilename = await getUniqueFilename(client, remoteDir, file.originalname);
      const remotePath = path.posix.join(remoteDir, remoteFilename);

      await client.uploadFrom(file.path, remotePath);
      urls.push(buildPublicUrl(credentials, folder, remoteFilename));
    }

    return urls;
  } finally {
    client.close();
  }
}

/**
 * Lists all files inside a folder on the remote server via FTP.
 */
export async function listFiles(
  credentials: SftpCredentials
): Promise<FileEntry[]> {
  const folder = credentials.folder ?? "uploads";
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);

    if (!(await ftpDirExists(client, remoteDir))) {
      throw new Error(`Directory "${folder}" does not exist.`);
    }

    const listing = await client.list(remoteDir);

    const files: FileEntry[] = listing
      .filter((item) => item.type === ftp.FileType.File)
      .map((item) => ({
        name: item.name,
        url: buildPublicUrl(credentials, folder, item.name),
        size: item.size,
      }));

    return files;
  } finally {
    client.close();
  }
}

/**
 * Lists all folders inside the base directory via FTP.
 */
export async function listFolders(
  credentials: SftpCredentials
): Promise<FolderEntry[]> {
  const client = await createFtpClient(credentials);

  try {
    if (!(await ftpDirExists(client, GODADDY_BASE_DIR))) {
      throw new Error("Base directory does not exist on the server. Please create it first.");
    }

    const listing = await client.list(GODADDY_BASE_DIR);

    const folders: FolderEntry[] = listing
      .filter((item) => item.type === ftp.FileType.Directory)
      .map((item) => ({
        name: item.name,
      }));

    return folders;
  } finally {
    client.close();
  }
}

/**
 * Creates an empty folder inside the base directory via FTP.
 */
export async function createFolder(
  credentials: SftpCredentials,
  folderName: string
): Promise<void> {
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folderName);

    if (await ftpDirExists(client, remoteDir)) {
      throw new Error(`A folder named "${folderName}" already exists.`);
    }

    await client.ensureDir(remoteDir);
    console.log(`[GoDaddy FTP] Created folder: ${remoteDir}`);
  } finally {
    client.close();
  }
}

/**
 * Deletes a single file from a folder via FTP.
 */
export async function deleteFile(
  credentials: SftpCredentials,
  filename: string
): Promise<void> {
  const folder = credentials.folder ?? "uploads";
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    const remotePath = path.posix.join(remoteDir, filename);

    if (!(await ftpFileExists(client, remotePath))) {
      throw new Error(`File "${filename}" not found in "${folder}".`);
    }

    await client.remove(remotePath);
    console.log(`[GoDaddy FTP] Deleted file: ${remotePath}`);
  } finally {
    client.close();
  }
}

/**
 * Deletes a folder and all its contents recursively via FTP.
 */
export async function deleteFolder(
  credentials: SftpCredentials,
  folderName: string
): Promise<void> {
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folderName);

    if (!(await ftpDirExists(client, remoteDir))) {
      throw new Error(`Directory "${folderName}" does not exist.`);
    }

    await client.removeDir(remoteDir);
    console.log(`[GoDaddy FTP] Deleted folder: ${remoteDir}`);
  } finally {
    client.close();
  }
}

/**
 * Renames a folder inside the base directory via FTP.
 */
export async function renameFolder(
  credentials: SftpCredentials,
  oldName: string,
  newName: string
): Promise<void> {
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
  } finally {
    client.close();
  }
}

/**
 * Renames a file inside a folder via FTP.
 */
export async function renameFile(
  credentials: SftpCredentials,
  oldFilename: string,
  newFilename: string
): Promise<void> {
  const folder = credentials.folder ?? "uploads";
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    const oldPath = path.posix.join(remoteDir, oldFilename);
    const newPath = path.posix.join(remoteDir, newFilename);

    if (!(await ftpFileExists(client, oldPath))) {
      throw new Error(`File "${oldFilename}" not found in "${folder}".`);
    }

    if (await ftpFileExists(client, newPath)) {
      throw new Error(`A file named "${newFilename}" already exists in "${folder}".`);
    }

    await client.rename(oldPath, newPath);
    console.log(`[GoDaddy FTP] Renamed file: ${oldPath} → ${newPath}`);
  } finally {
    client.close();
  }
}

/**
 * Moves a file from one folder to another via FTP.
 */
export async function moveFile(
  credentials: SftpCredentials,
  sourceFolder: string,
  targetFolder: string,
  filename: string
): Promise<void> {
  const client = await createFtpClient(credentials);

  try {
    const sourceDir = getRemoteDir(sourceFolder);
    const targetDir = getRemoteDir(targetFolder);
    const sourcePath = path.posix.join(sourceDir, filename);

    if (!(await ftpFileExists(client, sourcePath))) {
      throw new Error(`File "${filename}" not found in "${sourceFolder}".`);
    }

    if (!(await ftpDirExists(client, targetDir))) {
      throw new Error(`Target directory "${targetFolder}" does not exist.`);
    }

    const uniqueName = await getUniqueFilename(client, targetDir, filename);
    const targetPath = path.posix.join(targetDir, uniqueName);

    await client.rename(sourcePath, targetPath);
    console.log(`[GoDaddy FTP] Moved file: ${sourcePath} → ${targetPath}`);
  } finally {
    client.close();
  }
}

/**
 * Downloads a file from the remote server via FTP and returns it as a Buffer.
 */
export async function downloadFile(
  credentials: SftpCredentials,
  filename: string
): Promise<Buffer> {
  const folder = credentials.folder ?? "uploads";
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(folder);
    const remotePath = path.posix.join(remoteDir, filename);

    if (!(await ftpFileExists(client, remotePath))) {
      throw new Error(`File "${filename}" not found in "${folder}".`);
    }

    // Download to a temp file, then read into buffer
    const tmpPath = path.join(process.cwd(), "tmp_uploads", `dl_${Date.now()}_${filename}`);
    await client.downloadTo(tmpPath, remotePath);

    const data = fs.readFileSync(tmpPath);
    fs.unlinkSync(tmpPath);

    console.log(`[GoDaddy FTP] Downloaded file: ${remotePath}`);
    return data;
  } finally {
    client.close();
  }
}
