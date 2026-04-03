import { SftpCredentials, FileEntry, FolderEntry } from "./types";
/**
 * Uploads files to the remote server via SFTP.
 * Auto-creates the folder if it doesn't exist.
 * Returns public URLs for each uploaded file.
 */
export declare function uploadFiles(credentials: SftpCredentials, files: Express.Multer.File[]): Promise<string[]>;
/**
 * Lists all files inside a folder on the remote server.
 * Does NOT create the folder — throws an error if it doesn't exist.
 */
export declare function listFiles(credentials: SftpCredentials): Promise<FileEntry[]>;
export declare function listFolders(credentials: SftpCredentials): Promise<FolderEntry[]>;
/**
 * Deletes a single file from a folder.
 */
export declare function deleteFile(credentials: SftpCredentials, filename: string): Promise<void>;
/**
 * Deletes a folder and all its contents recursively.
 */
export declare function deleteFolder(credentials: SftpCredentials, folderName: string): Promise<void>;
/**
 * Renames a folder inside public_html.
 */
export declare function renameFolder(credentials: SftpCredentials, oldName: string, newName: string): Promise<void>;
/**
 * Renames a file inside a folder.
 */
export declare function renameFile(credentials: SftpCredentials, oldFilename: string, newFilename: string): Promise<void>;
