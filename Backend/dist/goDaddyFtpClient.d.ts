import { SftpCredentials, FileEntry, FolderEntry } from "./types";
/**
 * Uploads files to the remote server via FTP.
 */
export declare function uploadFiles(credentials: SftpCredentials, files: Express.Multer.File[]): Promise<string[]>;
/**
 * Lists all files inside a folder on the remote server via FTP.
 */
export declare function listFiles(credentials: SftpCredentials): Promise<FileEntry[]>;
/**
 * Lists all folders inside the base directory via FTP.
 */
export declare function listFolders(credentials: SftpCredentials): Promise<FolderEntry[]>;
/**
 * Creates an empty folder inside the base directory via FTP.
 */
export declare function createFolder(credentials: SftpCredentials, folderName: string): Promise<void>;
/**
 * Deletes a single file from a folder via FTP.
 */
export declare function deleteFile(credentials: SftpCredentials, filename: string): Promise<void>;
/**
 * Deletes a folder and all its contents recursively via FTP.
 */
export declare function deleteFolder(credentials: SftpCredentials, folderName: string): Promise<void>;
/**
 * Renames a folder inside the base directory via FTP.
 */
export declare function renameFolder(credentials: SftpCredentials, oldName: string, newName: string): Promise<void>;
/**
 * Renames a file inside a folder via FTP.
 */
export declare function renameFile(credentials: SftpCredentials, oldFilename: string, newFilename: string): Promise<void>;
/**
 * Moves a file from one folder to another via FTP.
 */
export declare function moveFile(credentials: SftpCredentials, sourceFolder: string, targetFolder: string, filename: string): Promise<void>;
/**
 * Downloads a file from the remote server via FTP and returns it as a Buffer.
 */
export declare function downloadFile(credentials: SftpCredentials, filename: string): Promise<Buffer>;
