import React, { useState, useRef } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { SftpCredentials, FolderEntry } from '../types';
import { ApiService } from '../services/api';
import { CustomSelect, buildFolderOptions } from './CustomSelect';

interface Props {
  credentials: SftpCredentials;
  folders: FolderEntry[];
  onUploadSuccess: () => void;
}

export const UploadCard: React.FC<Props> = ({ credentials, folders, onUploadSuccess }) => {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const addFiles = (newFiles: File[]) => {
    const existingNames = new Set(files.map(f => f.name));
    const toAdd = newFiles.filter(f => !existingNames.has(f.name));
    setFiles(prev => [...prev, ...toAdd]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    const folder = selectedFolder === '__new__' ? newFolderName.trim() : selectedFolder;
    if (!folder) {
      setError("Please select or create a destination folder");
      return;
    }
    if (!credentials.host || !credentials.user || !credentials.domain) {
      setError("Please fill in connection fields");
      return;
    }
    
    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const res = await ApiService.uploadFiles({ ...credentials, folder }, files, setProgress);
      if (res.success) {
        setSuccess(res.message);
        setFiles([]);
        onUploadSuccess();
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  return (
    <section
      className="bg-card shadow-sm rounded-2xl border border-taupe-200 p-5 flex flex-col"
      style={{ minHeight: '420px', maxHeight: 'calc(100vh - 200px)' }}
    >
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-taupe-100">
        <div className="bg-primary/10 p-1.5 rounded-lg">
          <Upload className="text-primary w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold mb-0.5 text-text leading-tight">Upload Files</h2>
          <p className="text-xs text-text-muted hidden sm:block">Drag & drop or browse</p>
        </div>
      </div>

      {/* Destination Folder */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-text block mb-1.5">Destination Folder</label>
        <div className="flex flex-col gap-2">
          <CustomSelect
            value={selectedFolder}
            onChange={setSelectedFolder}
            options={buildFolderOptions(folders)}
            placeholder="Select a folder..."
          />
          {selectedFolder === '__new__' && (
            <input
              type="text"
              className="w-full bg-background border border-taupe-200 rounded-xl px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              placeholder="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div className="flex-1 flex flex-col min-h-0">
        <div
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-colors mb-4 cursor-pointer flex-shrink-0
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-taupe-300 hover:border-primary hover:bg-background'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragActive(false); if(e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-10 h-10 bg-taupe-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <p className="text-text font-medium text-sm mb-0.5">Drag files here or <span className="text-primary underline">browse</span></p>
          <p className="text-text-muted text-[10px]">JPEG, PNG, GIF, WebP, SVG, PDF • Max 50 MB</p>
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,.pdf,application/pdf" onChange={handleFileChange} />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <ul className="space-y-1 mb-3 max-h-32 overflow-y-auto pr-1 border border-taupe-100 rounded-xl p-1.5 bg-background flex-shrink-0">
            {files.map((file, i) => (
              <li key={i} className="flex items-center justify-between p-1.5 hover:bg-taupe-100 rounded-lg group transition-colors">
                <span className="text-xs font-medium text-text truncate max-w-[65%]">� {file.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted">{formatSize(file.size)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="p-0.5 rounded bg-background border border-taupe-200 text-text hidden group-hover:block hover:text-red-500 hover:border-red-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Progress */}
        {progress > 0 && (
          <div className="mb-3 flex-shrink-0">
            <div className="h-1.5 w-full bg-taupe-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-right text-[10px] text-text-muted mt-0.5 font-medium">{progress}%</p>
          </div>
        )}

        {/* Status */}
        {(error || success) && (
          <div className={`p-2 rounded-lg text-xs mb-3 flex items-center gap-2 flex-shrink-0 ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error || success}
          </div>
        )}
      </div>

      {/* Upload Button */}
      <button
        type="button"
        disabled={files.length === 0 || uploading}
        onClick={handleUpload}
        className="w-full bg-text mt-1 text-white py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
      >
        <Upload className="w-4 h-4" />
        {uploading ? 'Uploading...' : 'Upload Files'}
      </button>
    </section>
  );
};
