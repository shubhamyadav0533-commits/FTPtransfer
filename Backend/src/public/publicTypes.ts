// ═══════════════════════════════════════════════════════════
// Public API — Type Definitions
// ═══════════════════════════════════════════════════════════

/** File category — determines which sub-folder on the server */
export type FileCategory = "image" | "video" | "document";

/** All structured error codes returned by the public API */
export type PublicApiErrorCode =
  | "INVALID_API_KEY"
  | "RATE_LIMIT_EXCEEDED"
  | "QUOTA_EXCEEDED"
  | "INVALID_FILE_TYPE"
  | "INVALID_FILENAME"
  | "FILE_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "USER_REQUIRED"
  | "SFTP_CONNECTION_FAILED"
  | "SFTP_UPLOAD_FAILED"
  | "REGISTRATION_FAILED"
  | "INTERNAL_ERROR";

/** Audit log action types */
export type AuditAction =
  | "UPLOAD"
  | "DELETE"
  | "LIST"
  | "REGISTER"
  | "REVOKE_KEY"
  | "REGENERATE_KEY"
  | "CREATE_USER"
  | "DELETE_USER";

// ─── Database Row Types ──────────────────────────────────

/** Row in the `tenants` table */
export interface TenantRow {
  id: string;
  email: string | null;
  sftp_host: string;
  sftp_user: string;
  sftp_password: string;
  sftp_port: number;
  sftp_domain: string;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  created_at: string;
}

/** Row in the `api_keys` table */
export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  key_prefix: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

/** Row in the `tenant_users` table */
export interface TenantUserRow {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  created_at: string;
}

/** Row in the `files` table */
export interface FileRow {
  id: string;
  tenant_id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  public_url: string;
  size_bytes: number;
  mime_type: string;
  file_category: FileCategory;
  created_at: string;
}

/** Row in the `audit_logs` table */
export interface AuditLogRow {
  id: string;
  tenant_id: string;
  action: AuditAction;
  resource: string | null;
  ip_address: string | null;
  error_code: string | null;
  created_at: string;
}

// ─── Decrypted Credentials ───────────────────────────────

/** SFTP credentials after decryption — ready for ssh2-sftp-client */
export interface DecryptedSftpCredentials {
  host: string;
  username: string;
  password: string;
  port: number;
  domain: string;
}

// ─── Request/Response Types ──────────────────────────────

/** Authenticated request context attached to res.locals */
export interface AuthContext {
  tenantId: string;
  tenant: TenantRow;
  sftpCredentials: DecryptedSftpCredentials;
}

/** Standard public API response wrapper */
export interface PublicApiResponse<T = undefined> {
  success: boolean;
  code?: PublicApiErrorCode;
  message: string;
  data?: T;
}

/** Paginated response for list endpoints */
export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Query parameters for the GET /files endpoint */
export interface ListFilesQuery {
  user_id?: string;
  category?: FileCategory;
  search?: string;
  page?: string;
  limit?: string;
}

/** Registration request body */
export interface RegisterBody {
  host: string;
  user: string;
  password: string;
  port: string;
  domain: string;
  email?: string;
}

/** Upload queue job payload */
export interface UploadJobPayload {
  tenantId: string;
  userId: string;
  filePath: string;
  originalFilename: string;
  sanitizedFilename: string;
  sizeBytes: number;
  mimeType: string;
  fileCategory: FileCategory;
  /** AES-256 encrypted SFTP credentials (stored as-is from tenant row) */
  encryptedHost: string;
  encryptedUser: string;
  encryptedPassword: string;
  sftpPort: number;
  sftpDomain: string;
}

/** Delete queue job payload */
export interface DeleteJobPayload {
  tenantId: string;
  userId: string;
  encryptedHost: string;
  encryptedUser: string;
  encryptedPassword: string;
  sftpPort: number;
  sftpDomain: string;
}

/** Public file record returned to API consumers (no internal IDs exposed) */
export interface PublicFileRecord {
  id: string;
  user_id: string;
  filename: string;
  original_filename: string;
  public_url: string;
  size_bytes: number;
  mime_type: string;
  file_category: FileCategory;
  created_at: string;
}

/** Request body for creating a sub-user */
export interface CreateUserBody {
  name: string;
  email: string;
}

/** Public user record returned to API consumers */
export interface PublicUserRecord {
  id: string;
  name: string;
  email: string;
  created_at: string;
}
