import { SftpCredentials, FileEntry, FolderEntry } from "./types";
/**
 * Uploads files to the remote server via SFTP.
 * Uses file-explorer-style naming: file, file(1), file(2) ...
 * Auto-creates the folder if it doesn't exist.
 */
export declare function uploadFiles(credentials: SftpCredentials, files: Express.Multer.File[]): Promise<string[]>;
/**
 * Lists all files inside a folder on the remote server.
 */
export declare function listFiles(credentials: SftpCredentials): Promise<FileEntry[]>;
/**
 * Lists all folders inside the base directory.
 */
export declare function listFolders(credentials: SftpCredentials): Promise<FolderEntry[]>;
/**
 * Creates an empty folder inside the base directory.
 */
export declare function createFolder(credentials: SftpCredentials, folderName: string): Promise<void>;
/**
 * Deletes a single file from a folder.
 */
export declare function deleteFile(credentials: SftpCredentials, filename: string): Promise<void>;
/**
 * Deletes a folder and all its contents recursively.
 */
export declare function deleteFolder(credentials: SftpCredentials, folderName: string): Promise<void>;
/**
 * Renames a folder inside the base directory.
 */
export declare function renameFolder(credentials: SftpCredentials, oldName: string, newName: string): Promise<void>;
/**
 * Renames a file inside a folder.
 */
export declare function renameFile(credentials: SftpCredentials, oldFilename: string, newFilename: string): Promise<void>;
/**
 * Moves a file from one folder to another.
 * This is effectively a rename across directories in SFTP.
 */
export declare function moveFile(credentials: SftpCredentials, sourceFolder: string, targetFolder: string, filename: string): Promise<void>;
/**
 * Downloads a file from the remote server and returns it as a Buffer.
 */
export declare function downloadFile(credentials: SftpCredentials, filename: string): Promise<Buffer>;
