import path from "path";
import type { FileCategory } from "./publicTypes";

/**
 * Validates that a file's actual content matches the claimed MIME type
 * by inspecting the magic bytes (file signature).
 *
 * Uses dynamic import because `file-type` is ESM-only.
 */
export async function validateFileContent(
  filePath: string
): Promise<{ valid: boolean; detectedMime: string }> {
  // file-type is ESM-only, must use dynamic import
  const { fileTypeFromFile } = await import("file-type");

  const result = await fileTypeFromFile(filePath);

  if (!result) {
    // Could not detect type from magic bytes — could be a plain text file
    // Allow it but categorize as document
    return { valid: true, detectedMime: "application/octet-stream" };
  }

  const allowedMimePatterns = [
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/avif",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    // Video
    "video/mp4",
    "video/x-msvideo",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/mpeg",
    "video/3gpp",
    // Audio
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/webm",
    // Archives
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
  ];

  const valid = allowedMimePatterns.includes(result.mime);
  return { valid, detectedMime: result.mime };
}

/**
 * Sanitizes a filename to prevent path traversal, XSS, and filesystem issues.
 *
 * - Strips directory components (../, ..\, etc.)
 * - Removes null bytes and control characters
 * - Removes HTML-unsafe characters
 * - Replaces spaces with underscores
 * - Truncates to 200 characters max
 */
export function sanitizeFilename(raw: string): string {
  // Get just the basename — strips any directory components
  let name = path.basename(raw);

  // Remove null bytes
  name = name.replace(/\0/g, "");

  // Remove control characters (0x00-0x1F, 0x7F)
  name = name.replace(/[\x00-\x1F\x7F]/g, "");

  // Remove HTML-unsafe characters
  name = name.replace(/[<>"'`&;|]/g, "");

  // Replace spaces and special filesystem chars with underscores
  name = name.replace(/[\s#%{}\\^~[\]]/g, "_");

  // Collapse multiple underscores
  name = name.replace(/_+/g, "_");

  // Remove leading/trailing dots and underscores
  name = name.replace(/^[._]+|[._]+$/g, "");

  // Truncate to 200 chars (preserving extension)
  if (name.length > 200) {
    const ext = path.extname(name);
    const base = name.substring(0, 200 - ext.length);
    name = `${base}${ext}`;
  }

  // Fallback if everything was stripped
  if (!name || name.length === 0) {
    name = `file_${Date.now()}`;
  }

  return name;
}

/**
 * Maps a MIME type to a high-level file category.
 * This determines which sub-folder the file is stored in on the server.
 */
export function getCategoryFromMime(mime: string): FileCategory {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}
