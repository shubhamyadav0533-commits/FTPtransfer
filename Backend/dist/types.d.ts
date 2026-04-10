/** SFTP connection credentials */
export interface SftpCredentials {
    host: string;
    user: string;
    password: string;
    port: number;
    /** The public web domain used to construct accessible URLs */
    domain: string;
    /** Folder name inside public_html (e.g. "cats", "uploads") — optional for folder-listing */
    folder?: string;
}
/** Single file entry with its public URL */
export interface FileEntry {
    name: string;
    url: string;
    size: number;
}
/** Single folder entry */
export interface FolderEntry {
    name: string;
}
/** Response for upload operations */
export interface UploadResponse {
    success: boolean;
    urls: string[];
    message: string;
}
/** Response for listing files */
export interface FilesResponse {
    success: boolean;
    files: FileEntry[];
    message: string;
}
/** Response for listing folders */
export interface FoldersResponse {
    success: boolean;
    folders: FolderEntry[];
    message: string;
}
/** Response for delete operations */
export interface DeleteResponse {
    success: boolean;
    message: string;
}
/** Response for rename operations */
export interface RenameResponse {
    success: boolean;
    message: string;
}
/** Response for move-file operations */
export interface MoveFileResponse {
    success: boolean;
    message: string;
}
/** Response for create-folder operations */
export interface CreateFolderResponse {
    success: boolean;
    message: string;
}
