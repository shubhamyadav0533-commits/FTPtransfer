import { supabase } from "./supabaseClient";
import type { AuditAction } from "./publicTypes";

/**
 * Logs an audit event to the `audit_logs` table.
 *
 * This is fire-and-forget: errors are logged to console
 * but never thrown, so they don't interrupt the main request.
 */
export async function logAudit(
  tenantId: string,
  action: AuditAction,
  resource: string | null,
  ipAddress: string | null,
  errorCode?: string | null
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      action,
      resource,
      ip_address: ipAddress,
      error_code: errorCode ?? null,
    });
  } catch (error) {
    console.error("[Audit] Failed to log audit event:", error);
  }
}
