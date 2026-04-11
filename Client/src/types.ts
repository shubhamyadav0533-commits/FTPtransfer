export interface SftpCredentials {
  host: string;
  user: string;
  password?: string;
  port: number;
  domain: string;
  folder?: string; // Target folder for operations
}

export interface FileEntry {
  name: string;
  url: string;
  size: number;
  modifiedAt: number;
}

export interface FolderEntry {
  name: string;
}

export interface UploadResponse {
  success: boolean;
  urls: string[];
  message: string;
}

export interface FilesResponse {
  success: boolean;
  files: FileEntry[];
  message: string;
}

export interface FoldersResponse {
  success: boolean;
  folders: FolderEntry[];
  message: string;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}

export interface RenameResponse {
  success: boolean;
  message: string;
}

export interface MoveFileResponse {
  success: boolean;
  message: string;
}

export interface CreateFolderResponse {
  success: boolean;
  message: string;
}

/** Filter type for the GoDaddy folder browser */
export type FileTypeFilter = 'all' | 'images' | 'videos' | 'documents' | 'audio';

export type ActivePage = 'hostinger' | 'godaddy';
