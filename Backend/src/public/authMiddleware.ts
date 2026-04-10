import type { Request, Response, NextFunction } from "express";
import { supabase } from "./supabaseClient";
import { hashApiKey, decrypt } from "./encryption";
import type {
  AuthContext,
  PublicApiResponse,
  TenantRow,
  ApiKeyRow,
} from "./publicTypes";

/**
 * Express middleware that authenticates requests using an API key.
 *
 * Expects the header: `Authorization: Bearer <API_KEY>`
 *
 * On success, attaches an `AuthContext` to `res.locals.auth` containing:
 * - tenantId
 * - tenant row
 * - decrypted SFTP credentials
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const response: PublicApiResponse = {
      success: false,
      code: "INVALID_API_KEY",
      message: "Missing or malformed Authorization header. Expected: Bearer <API_KEY>",
    };
    res.status(401).json(response);
    return;
  }

  const rawKey = authHeader.substring(7).trim();

  if (!rawKey) {
    const response: PublicApiResponse = {
      success: false,
      code: "INVALID_API_KEY",
      message: "API key is empty.",
    };
    res.status(401).json(response);
    return;
  }

  const keyHash = hashApiKey(rawKey);

  // Look up the key in the database
  const { data: keyRecord, error: keyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single<ApiKeyRow>();

  if (keyError || !keyRecord) {
    const response: PublicApiResponse = {
      success: false,
      code: "INVALID_API_KEY",
      message: "Invalid or revoked API key.",
    };
    res.status(401).json(response);
    return;
  }

  // Fetch the associated tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", keyRecord.tenant_id)
    .single<TenantRow>();

  if (tenantError || !tenant) {
    const response: PublicApiResponse = {
      success: false,
      code: "INVALID_API_KEY",
      message: "Tenant associated with this API key no longer exists.",
    };
    res.status(401).json(response);
    return;
  }

  // Decrypt SFTP credentials
  const authContext: AuthContext = {
    tenantId: tenant.id,
    tenant,
    sftpCredentials: {
      host: decrypt(tenant.sftp_host),
      username: decrypt(tenant.sftp_user),
      password: decrypt(tenant.sftp_password),
      port: tenant.sftp_port,
      domain: tenant.sftp_domain,
    },
  };

  res.locals.auth = authContext;
  next();
}

/**
 * Helper to extract the AuthContext from res.locals.
 * Call this inside route handlers after the authMiddleware has run.
 */
export function getAuthContext(res: Response): AuthContext {
  return res.locals.auth as AuthContext;
}
