import {
  SftpCredentials,
  UploadResponse,
  FilesResponse,
  FoldersResponse,
  DeleteResponse,
  RenameResponse,
} from "../types";

const API_BASE_URL = "http://localhost:3000"; // Adjust if backend runs on different host/port

const headers = {
  "Content-Type": "application/json",
};

export class ApiService {
  static async fetchFolders(credentials: SftpCredentials): Promise<FoldersResponse> {
    const res = await fetch(`${API_BASE_URL}/api/folders`, {
      method: "POST",
      headers,
      body: JSON.stringify(credentials),
    });
    return res.json();
  }

  static async fetchFiles(credentials: SftpCredentials & { folder: string }): Promise<FilesResponse> {
    const res = await fetch(`${API_BASE_URL}/api/files`, {
      method: "POST",
      headers,
      body: JSON.stringify(credentials),
    });
    return res.json();
  }

  static async uploadFiles(credentials: SftpCredentials & { folder: string }, files: File[], onProgress?: (pct: number) => void): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("host", credentials.host);
    formData.append("user", credentials.user);
    if (credentials.password) formData.append("password", credentials.password);
    formData.append("port", credentials.port.toString());
    formData.append("domain", credentials.domain);
    formData.append("folder", credentials.folder);
    
    files.forEach((file) => formData.append("files", file));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      });
      
      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.success) {
            reject(new Error(data.message || "Upload failed"));
          } else {
            resolve(data);
          }
        } catch {
          reject(new Error(xhr.status >= 400 ? `Server error (${xhr.status}): ${xhr.statusText}` : "Invalid server response"));
        }
      });
      
      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      
      xhr.open("POST", `${API_BASE_URL}/api/upload`);
      xhr.send(formData);
    });
  }

  static async deleteFile(credentials: SftpCredentials & { folder: string }, filename: string): Promise<DeleteResponse> {
    const res = await fetch(`${API_BASE_URL}/api/file`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ...credentials, filename }),
    });
    return res.json();
  }

  static async deleteFolder(credentials: SftpCredentials, folderName: string): Promise<DeleteResponse> {
    const res = await fetch(`${API_BASE_URL}/api/folder`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ...credentials, folderName }),
    });
    return res.json();
  }

  static async renameFolder(credentials: SftpCredentials, oldName: string, newName: string): Promise<RenameResponse> {
    const res = await fetch(`${API_BASE_URL}/api/folder`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...credentials, oldName, newName }),
    });
    return res.json();
  }

  static async renameFile(credentials: SftpCredentials & { folder: string }, oldName: string, newName: string): Promise<RenameResponse> {
    const res = await fetch(`${API_BASE_URL}/api/file`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...credentials, oldName, newName }),
    });
    return res.json();
  }
}
