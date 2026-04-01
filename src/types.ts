/** FTP connection credentials */
export interface FtpCredentials {
  host: string;
  user: string;
  password: string;
  port: number;
  /** The public web domain used to construct accessible URLs */
  domain: string;
  /** Folder name inside public_html (e.g. "cats", "uploads") */
  folder: string;
}

/** Single file entry with its public URL */
export interface FileEntry {
  name: string;
  url: string;
  size: number;
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
