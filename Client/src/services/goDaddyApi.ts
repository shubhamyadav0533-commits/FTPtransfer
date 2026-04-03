import {
  SftpCredentials,
  UploadResponse,
  FilesResponse,
  FoldersResponse,
  DeleteResponse,
  RenameResponse,
  MoveFileResponse,
  CreateFolderResponse,
} from "../types";

const headers = {
  "Content-Type": "application/json",
};

/**
 * GoDaddy-specific API service.
 * All endpoints use /api/godaddy/* prefix.
 * Credentials are passed from the GoDaddy connection card.
 */
export class GoDaddyApiService {
  static async fetchFolders(credentials: SftpCredentials): Promise<FoldersResponse> {
    const res = await fetch("/api/godaddy/folders", {
      method: "POST",
      headers,
      body: JSON.stringify(credentials),
    });
    return res.json() as Promise<FoldersResponse>;
  }

  static async fetchFiles(credentials: SftpCredentials & { folder: string }): Promise<FilesResponse> {
    const res = await fetch("/api/godaddy/files", {
      method: "POST",
      headers,
      body: JSON.stringify(credentials),
    });
    return res.json() as Promise<FilesResponse>;
  }

  static async uploadFiles(
    credentials: SftpCredentials & { folder: string },
    files: File[],
    onProgress?: (pct: number) => void
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("host", credentials.host);
    formData.append("user", credentials.user);
    if (credentials.password) formData.append("password", credentials.password);
    formData.append("port", credentials.port.toString());
    formData.append("domain", credentials.domain);
    formData.append("folder", credentials.folder);

    files.forEach((file) => formData.append("files", file));

    return new Promise<UploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      });

      xhr.addEventListener("load", () => {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch {
          reject(new Error("Invalid server response"));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));

      xhr.open("POST", "/api/godaddy/upload");
      xhr.send(formData);
    });
  }

  static async createFolder(credentials: SftpCredentials, folderName: string): Promise<CreateFolderResponse> {
    const res = await fetch("/api/godaddy/create-folder", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...credentials, folderName }),
    });
    return res.json() as Promise<CreateFolderResponse>;
  }

  static async deleteFile(
    credentials: SftpCredentials & { folder: string },
    filename: string
  ): Promise<DeleteResponse> {
    const res = await fetch("/api/godaddy/file", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ...credentials, filename }),
    });
    return res.json() as Promise<DeleteResponse>;
  }

  static async deleteFolder(credentials: SftpCredentials, folderName: string): Promise<DeleteResponse> {
    const res = await fetch("/api/godaddy/folder", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ...credentials, folderName }),
    });
    return res.json() as Promise<DeleteResponse>;
  }

  static async renameFolder(
    credentials: SftpCredentials,
    oldName: string,
    newName: string
  ): Promise<RenameResponse> {
    const res = await fetch("/api/godaddy/folder", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...credentials, oldName, newName }),
    });
    return res.json() as Promise<RenameResponse>;
  }

  static async renameFile(
    credentials: SftpCredentials & { folder: string },
    oldName: string,
    newName: string
  ): Promise<RenameResponse> {
    const res = await fetch("/api/godaddy/file", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...credentials, oldName, newName }),
    });
    return res.json() as Promise<RenameResponse>;
  }

  static async moveFile(
    credentials: SftpCredentials,
    sourceFolder: string,
    targetFolder: string,
    filename: string
  ): Promise<MoveFileResponse> {
    const res = await fetch("/api/godaddy/move-file", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...credentials, sourceFolder, targetFolder, filename }),
    });
    return res.json() as Promise<MoveFileResponse>;
  }

  static async downloadFile(
    credentials: SftpCredentials & { folder: string },
    filename: string
  ): Promise<void> {
    const res = await fetch("/api/godaddy/download", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...credentials, filename }),
    });

    if (!res.ok) {
      const errorBody = await res.json() as { message: string };
      throw new Error(errorBody.message || "Download failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
