import { Client, FileInfo } from "basic-ftp";
import path from "path";
import { FtpCredentials, FileEntry } from "./types";

/**
 * Builds the remote directory path from the folder name.
 */
function getRemoteDir(folder: string): string {
  // Sanitize: remove slashes, dots, etc. to avoid path traversal
  const clean = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  return `/public_html/${clean}`;
}

/**
 * Creates and connects an FTP client with the given credentials.
 */
async function createFtpClient(credentials: FtpCredentials): Promise<Client> {
  const client = new Client();
  client.ftp.verbose = false;

  await client.access({
    host: credentials.host,
    user: credentials.user,
    password: credentials.password,
    port: credentials.port,
    secure: false,
  });

  return client;
}

/**
 * Builds the public URL for a file.
 * Uses the domain field to construct: https://domain/uploads/filename
 */
function buildPublicUrl(credentials: FtpCredentials, filename: string): string {
  const domain = credentials.domain.trim();
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cleanFolder = credentials.folder.replace(/[^a-zA-Z0-9_-]/g, "");
  return `https://${cleanDomain}/${cleanFolder}/${encodeURIComponent(filename)}`;
}

/**
 * Uploads files to the remote server via FTP.
 * Auto-creates /public_html/uploads/ if it doesn't exist.
 * Returns public URLs for each uploaded file.
 */
export async function uploadFiles(
  credentials: FtpCredentials,
  files: Express.Multer.File[]
): Promise<string[]> {
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(credentials.folder);
    console.log(`[FTP] Folder: "${credentials.folder}" → Remote dir: "${remoteDir}"`);
    // Ensure the target directory exists (creates it if not)
    await client.ensureDir(remoteDir);

    const urls: string[] = [];

    for (const file of files) {
      const remoteFilename = `${Date.now()}_${file.originalname}`;
      const remotePath = path.posix.join(remoteDir, remoteFilename);

      // Upload from the buffer stored on disk by multer
      await client.uploadFrom(file.path, remotePath);

      urls.push(buildPublicUrl(credentials, remoteFilename));
    }

    return urls;
  } finally {
    client.close();
  }
}

/**
 * Lists all files inside /public_html/uploads/ on the remote server.
 * Returns file entries with public URLs.
 */
export async function listFiles(
  credentials: FtpCredentials
): Promise<FileEntry[]> {
  const client = await createFtpClient(credentials);

  try {
    const remoteDir = getRemoteDir(credentials.folder);
    // Ensure the directory exists before listing
    await client.ensureDir(remoteDir);

    const listing: FileInfo[] = await client.list(remoteDir);

    const files: FileEntry[] = listing
      .filter((item) => item.type === 1) // type 1 = file (not directory)
      .map((item) => ({
        name: item.name,
        url: buildPublicUrl(credentials, item.name),
        size: item.size,
      }));

    return files;
  } finally {
    client.close();
  }
}
