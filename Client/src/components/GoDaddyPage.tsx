import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Folder as FolderIcon,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Copy,
  Check,
  FolderOpen,
  AlertCircle,
  Search,
  X,
  Pencil,
  Upload,
  FolderPlus,
  Download,
  FileText,
  Film,
  Music,
  Image as ImageIcon,
  FileSpreadsheet,
  Presentation,
  File as FileIcon,
  Filter,
} from 'lucide-react';
import { GoDaddyApiService } from '../services/goDaddyApi';
import {
  SftpCredentials,
  FolderEntry,
  FileEntry,
  FileTypeFilter,
} from '../types';

// ─── File type detection ─────────────────────────────────
const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico', '.avif',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.avi', '.mov', '.wmv', '.mkv', '.webm', '.mpeg', '.3gp',
]);
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
]);
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
]);

type DetectedFileType = 'image' | 'video' | 'document' | 'audio' | 'other';

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return filename.slice(dotIndex).toLowerCase();
}

function detectFileType(filename: string): DetectedFileType {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'other';
}

function matchesFilter(filename: string, filter: FileTypeFilter): boolean {
  if (filter === 'all') return true;
  const type = detectFileType(filename);
  switch (filter) {
    case 'images': return type === 'image';
    case 'videos': return type === 'video';
    case 'documents': return type === 'document';
    case 'audio': return type === 'audio';
    default: return true;
  }
}

function getFileTypeIcon(filename: string): React.ReactNode {
  const ext = getFileExtension(filename);
  const type = detectFileType(filename);

  switch (type) {
    case 'video':
      return <Film className="w-8 h-8 text-purple-500" />;
    case 'audio':
      return <Music className="w-8 h-8 text-pink-500" />;
    case 'document':
      if (ext === '.pdf') return <FileText className="w-8 h-8 text-red-500" />;
      if (ext === '.xls' || ext === '.xlsx' || ext === '.csv') return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
      if (ext === '.ppt' || ext === '.pptx') return <Presentation className="w-8 h-8 text-orange-500" />;
      return <FileText className="w-8 h-8 text-blue-500" />;
    default:
      return <FileIcon className="w-8 h-8 text-text-muted" />;
  }
}

// ─── Filter pill data ────────────────────────────────────
interface FilterOption {
  key: FileTypeFilter;
  label: string;
  icon: React.ReactNode;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'all', label: 'All', icon: <Filter className="w-3.5 h-3.5" /> },
  { key: 'images', label: 'Images', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { key: 'videos', label: 'Videos', icon: <Film className="w-3.5 h-3.5" /> },
  { key: 'documents', label: 'Docs', icon: <FileText className="w-3.5 h-3.5" /> },
  { key: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
];

// ─── Size formatter ──────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Accepted file types for the input ───────────────────
const ACCEPTED_FILE_TYPES = [
  'image/*',
  'video/*',
  'audio/*',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip', '.rar', '.7z',
].join(',');

// ─── Props ───────────────────────────────────────────────
interface Props {
  credentials: SftpCredentials;
  onConfirmDelete: (message: string, action: () => void) => void;
  refreshTrigger: number;
}

// ─── Auto-scroll edge config ─────────────────────────────
const AUTO_SCROLL_EDGE_PX = 60;
const AUTO_SCROLL_SPEED = 8;

export const GoDaddyPage: React.FC<Props> = ({
  credentials,
  onConfirmDelete,
  refreshTrigger,
}) => {
  // ─── State ─────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Selection
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Rename
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameFileValue, setRenameFileValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FileTypeFilter>('all');

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Create folder
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Drag to move
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<string | null>(null);

  // ─── Auto-clear status messages ────────────────────────
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Auto-scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card ref for outside click
  const cardRef = useRef<HTMLDivElement>(null);

  // ─── Fetch Folders ─────────────────────────────────────
  const handleFetchFolders = useCallback(async () => {
    if (!credentials.host || !credentials.user || !credentials.domain) {
      setError('Please fill in connection fields');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await GoDaddyApiService.fetchFolders(credentials);
      if (res.success) {
        setFolders(res.folders);
        setSuccess(res.message);
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  // ─── Fetch Files ───────────────────────────────────────
  const handleOpenFolder = useCallback(
    async (folderName: string) => {
      setCurrentFolder(folderName);
      setFilesLoading(true);
      setError(null);
      setSuccess(null);
      setSelectedFile(null);
      setRenamingFile(null);
      setSearchQuery('');
      try {
        const res = await GoDaddyApiService.fetchFiles({ ...credentials, folder: folderName });
        if (res.success) {
          setFiles(res.files);
        } else {
          setError(res.message);
          setFiles([]);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch files';
        setError(msg);
        setFiles([]);
      } finally {
        setFilesLoading(false);
      }
    },
    [credentials]
  );

  // ─── Refresh ───────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    if (currentFolder) {
      handleOpenFolder(currentFolder);
    } else {
      handleFetchFolders();
    }
  }, [currentFolder, handleOpenFolder, handleFetchFolders]);

  // Auto-refresh on trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // ─── Create Folder ─────────────────────────────────────
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await GoDaddyApiService.createFolder(credentials, name);
      if (res.success) {
        setIsCreatingFolder(false);
        setNewFolderName('');
        await handleFetchFolders();
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Create folder failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [credentials, newFolderName, handleFetchFolders]);

  // Focus input when creating folder
  useEffect(() => {
    if (isCreatingFolder) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50);
    }
  }, [isCreatingFolder]);

  // ─── Upload Files ──────────────────────────────────────
  const handleUploadFiles = useCallback(async (filesToUpload: File[]) => {
    if (!currentFolder) {
      setError('Please open a folder before uploading');
      return;
    }
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const res = await GoDaddyApiService.uploadFiles(
        { ...credentials, folder: currentFolder },
        filesToUpload,
        setUploadProgress
      );
      if (res.success) {
        setSuccess(res.message);
        await handleOpenFolder(currentFolder);
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  }, [credentials, currentFolder, handleOpenFolder]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleUploadFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  }, [handleUploadFiles]);

  // ─── Delete Folder ─────────────────────────────────────
  const handleDeleteFolder = useCallback(
    (folderName: string) => {
      onConfirmDelete(`Delete folder "${folderName}" and ALL its contents? This cannot be undone.`, async () => {
        setLoading(true);
        try {
          const res = await GoDaddyApiService.deleteFolder(credentials, folderName);
          if (res.success) {
            if (currentFolder === folderName) setCurrentFolder(null);
            setSelectedFolder(null);
            await handleFetchFolders();
          } else {
            setError(res.message);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Delete failed';
          setError(msg);
        } finally {
          setLoading(false);
        }
      });
    },
    [credentials, currentFolder, handleFetchFolders, onConfirmDelete]
  );

  // ─── Delete File ───────────────────────────────────────
  const handleDeleteFile = useCallback(
    (filename: string) => {
      if (!currentFolder) return;
      onConfirmDelete(`Delete "${filename}" from "${currentFolder}"? This cannot be undone.`, async () => {
        setFilesLoading(true);
        try {
          const res = await GoDaddyApiService.deleteFile({ ...credentials, folder: currentFolder }, filename);
          if (res.success) {
            setSelectedFile(null);
            await handleOpenFolder(currentFolder);
          } else {
            setError(res.message);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Delete failed';
          setError(msg);
        } finally {
          setFilesLoading(false);
        }
      });
    },
    [credentials, currentFolder, handleOpenFolder, onConfirmDelete]
  );

  // ─── Rename Folder ─────────────────────────────────────
  const startRenamingFolder = useCallback((folderName: string) => {
    setRenamingFolder(folderName);
    setRenameFolderValue(folderName);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  const handleRenameFolder = useCallback(async () => {
    if (!renamingFolder || !renameFolderValue.trim() || renameFolderValue.trim() === renamingFolder) {
      setRenamingFolder(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await GoDaddyApiService.renameFolder(credentials, renamingFolder, renameFolderValue.trim());
      if (res.success) {
        setRenamingFolder(null);
        setSelectedFolder(null);
        await handleFetchFolders();
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Rename failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [credentials, renamingFolder, renameFolderValue, handleFetchFolders]);

  // ─── Rename File ───────────────────────────────────────
  const startRenamingFile = useCallback((fileName: string) => {
    setRenamingFile(fileName);
    setRenameFileValue(fileName);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  const handleRenameFile = useCallback(async () => {
    if (!renamingFile || !renameFileValue.trim() || renameFileValue.trim() === renamingFile || !currentFolder) {
      setRenamingFile(null);
      return;
    }
    setFilesLoading(true);
    setError(null);
    try {
      const res = await GoDaddyApiService.renameFile(
        { ...credentials, folder: currentFolder },
        renamingFile,
        renameFileValue.trim()
      );
      if (res.success) {
        setRenamingFile(null);
        setSelectedFile(null);
        await handleOpenFolder(currentFolder);
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Rename failed';
      setError(msg);
    } finally {
      setFilesLoading(false);
    }
  }, [credentials, currentFolder, renamingFile, renameFileValue, handleOpenFolder]);

  // ─── Download File ─────────────────────────────────────
  const handleDownloadFile = useCallback(async (filename: string) => {
    if (!currentFolder) return;
    setDownloading(true);
    setDownloadProgress(0);
    setDownloadingFile(filename);
    setError(null);
    try {
      await GoDaddyApiService.downloadFile(
        { ...credentials, folder: currentFolder },
        filename,
        (pct) => setDownloadProgress(pct)
      );
      setSuccess(`Downloaded "${filename}"`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Download failed';
      setError(msg);
    } finally {
      setDownloading(false);
      setTimeout(() => {
        setDownloadProgress(0);
        setDownloadingFile(null);
      }, 2000);
    }
  }, [credentials, currentFolder]);

  // ─── Copy URL ──────────────────────────────────────────
  const copyToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }, []);

  // ─── Drag & Drop — move file into folder ───────────────
  const handleFileDragStart = useCallback((e: React.DragEvent, fileName: string) => {
    setDraggedFile(fileName);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fileName);
  }, []);

  const handleFileDragEnd = useCallback(() => {
    setDraggedFile(null);
    setDropTargetFolder(null);
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetFolder(folderName);
  }, []);

  const handleFolderDragLeave = useCallback(() => {
    setDropTargetFolder(null);
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, targetFolderName: string) => {
    e.preventDefault();
    setDropTargetFolder(null);

    if (!draggedFile || !currentFolder) return;

    // Move file via API
    setFilesLoading(true);
    setError(null);
    try {
      const res = await GoDaddyApiService.moveFile(
        credentials,
        currentFolder,
        targetFolderName,
        draggedFile
      );
      if (res.success) {
        setSuccess(`Moved "${draggedFile}" to "${targetFolderName}"`);
        setDraggedFile(null);
        // Navigate into the target folder
        setCurrentFolder(null);
        await handleFetchFolders();
        await handleOpenFolder(targetFolderName);
      } else {
        setError(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Move failed';
      setError(msg);
    } finally {
      setFilesLoading(false);
    }
  }, [credentials, currentFolder, draggedFile, handleFetchFolders, handleOpenFolder]);

  // ─── Drag & Drop — upload external files ───────────────
  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only activate drop zone if we're NOT dragging an internal file
    if (!draggedFile) {
      setIsDragActive(true);
    }
  }, [draggedFile]);

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    // Only deactivate if leaving the container (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null;
    if (cardRef.current && (!relatedTarget || !cardRef.current.contains(relatedTarget))) {
      setIsDragActive(false);
    }
  }, []);

  const handleExternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);

    // Skip if this was an internal file drag
    if (draggedFile) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (!currentFolder) {
        setError('Please open a folder first before dropping files');
        return;
      }
      handleUploadFiles(Array.from(e.dataTransfer.files));
    }
  }, [draggedFile, currentFolder, handleUploadFiles]);

  // ─── Auto-scroll during drag ───────────────────────────
  const handleDragOverAutoScroll = useCallback((e: React.DragEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const y = e.clientY;

    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }

    if (y - rect.top < AUTO_SCROLL_EDGE_PX) {
      // Near top edge → scroll up
      autoScrollIntervalRef.current = setInterval(() => {
        container.scrollTop -= AUTO_SCROLL_SPEED;
      }, 16);
    } else if (rect.bottom - y < AUTO_SCROLL_EDGE_PX) {
      // Near bottom edge → scroll down
      autoScrollIntervalRef.current = setInterval(() => {
        container.scrollTop += AUTO_SCROLL_SPEED;
      }, 16);
    }
  }, []);

  // Clean up auto-scroll on unmount
  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, []);

  // ─── Deselect on outside click ─────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-item-card]') || target.closest('[data-item-action]')) return;
      setSelectedFolder(null);
      setSelectedFile(null);
      if (renamingFolder) setRenamingFolder(null);
      if (renamingFile) setRenamingFile(null);
    };
    const el = cardRef.current;
    el?.addEventListener('click', handler);
    return () => el?.removeEventListener('click', handler);
  }, [renamingFolder, renamingFile]);

  // ─── Filter Logic ─────────────────────────────────────
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = matchesFilter(f.name, activeFilter);
    return matchesSearch && matchesType;
  });

  const isRefreshing = currentFolder ? filesLoading : loading;

  // ─── Check if we have folders to show as drop targets ──
  // When user is inside a folder and dragging a file, we show a
  // sidebar/overlay of other folders to drop into. For simplicity,
  // we'll instead show the folders at the TOP of the file view
  // as small drop targets when a file is being dragged.

  return (
    <section
      ref={cardRef}
      className={`bg-card shadow-sm rounded-2xl border p-5 flex flex-col card-enter transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-taupe-200'
        }`}
      style={{ minHeight: '480px', maxHeight: '100vh' }}
      onDragOver={handleExternalDragOver}
      onDragLeave={handleExternalDragLeave}
      onDrop={handleExternalDrop}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-taupe-100">
        <div className="flex items-center gap-2.5">
          {currentFolder && (
            <button
              onClick={() => {
                setCurrentFolder(null);
                setSelectedFile(null);
                setRenamingFile(null);
                setActiveFilter('all');
                setSearchQuery('');
                handleFetchFolders();
              }}
              className="p-1.5 hover:bg-taupe-100 rounded-lg text-text-muted transition-colors"
              title="Back to folders"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="bg-primary/10 p-1.5 rounded-lg">
            <FolderOpen className="text-primary w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text leading-tight">
              {currentFolder ? `${currentFolder}` : 'Folder Browser'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Create Folder button */}
          {!currentFolder && (
            <button
              onClick={() => setIsCreatingFolder(true)}
              className="flex items-center gap-1.5 bg-background border border-taupe-200 hover:bg-taupe-100 text-text px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              title="Create Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Create Folder</span>
            </button>
          )}

          {/* Upload button (only in folder view) */}
          {currentFolder && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 bg-text text-white hover:bg-primary px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              title="Upload Files"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload Files'}</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 bg-background border border-taupe-200 hover:bg-taupe-100 text-text px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        onChange={handleFileInputChange}
      />

      {/* ── Upload Progress ── */}
      {uploadProgress > 0 && (
        <div className="mb-3">
          <div className="h-1.5 w-full bg-taupe-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-right text-[10px] text-text-muted mt-0.5 font-medium">{uploadProgress}%</p>
        </div>
      )}

      {downloading && (
        <div className="mb-3">
          <div className="h-1.5 w-full bg-taupe-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <p className="text-right text-[10px] text-text-muted mt-0.5 font-medium">
            {downloadingFile ? `${downloadingFile}: ` : ''}{downloadProgress}%
          </p>
        </div>
      )}

      {/* ── Filter Pills (only inside a folder) ── */}
      {currentFolder && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              className={`filter-pill flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all duration-150
                ${activeFilter === opt.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-taupe-100 text-text-muted hover:bg-taupe-200 hover:text-text'
                }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
          {activeFilter !== 'all' && (
            <button
              onClick={() => setActiveFilter('all')}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Search Bar ── */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
        <input
          type="text"
          placeholder={currentFolder ? `Search files${activeFilter !== 'all' ? ` (${activeFilter})` : ''}...` : 'Search folders...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-background border border-taupe-200 rounded-xl pl-8 pr-8 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-taupe-200 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>

      {/* ── Status Messages ── */}
      {(error || success) && (
        <div
          className={`p-2.5 rounded-lg text-xs select-none mb-3 flex items-center gap-2 ${error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error || success}
        </div>
      )}

      {/* ── Drag overlay hint ── */}
      {isDragActive && currentFolder && (
        <div className="mb-3 p-4 border-2 border-dashed border-primary rounded-xl bg-primary/5 text-center text-sm text-primary font-medium animate-pulse">
          <Upload className="w-5 h-5 mx-auto mb-1" />
          Drop files here to upload to "{currentFolder}"
        </div>
      )}

      {/* ── Drop targets for moving files (shown when dragging inside a folder) ── */}
      {draggedFile && currentFolder && folders.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-text-muted font-semibold mb-1.5 uppercase tracking-wider">Drop into folder:</p>
          <div className="flex flex-wrap gap-1.5">
            {folders
              .filter((f) => f.name !== currentFolder)
              .map((f) => (
                <div
                  key={f.name}
                  onDragOver={(e) => handleFolderDragOver(e, f.name)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(e) => handleFolderDrop(e, f.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 cursor-pointer
                    ${dropTargetFolder === f.name
                      ? 'border-primary bg-primary/10 text-primary scale-105 shadow-sm'
                      : 'border-taupe-200 bg-taupe-50 text-text-muted hover:border-primary/30'
                    }`}
                >
                  <FolderIcon className="w-3.5 h-3.5" />
                  {f.name}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Content Area ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        onDragOver={draggedFile ? handleDragOverAutoScroll : undefined}
      >
        {/* ── Folders View ── */}
        {!currentFolder && (
          <div>
            {/* Create folder inline input */}
            {isCreatingFolder && (
              <div className="flex items-center gap-2 mb-3 p-3 bg-primary/5 border border-primary/20 rounded-xl" data-item-action>
                <FolderPlus className="w-4 h-4 text-primary shrink-0" />
                <input
                  ref={newFolderInputRef}
                  type="text"
                  placeholder="New folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                  }}
                  className="flex-1 bg-white border border-primary/30 rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={handleCreateFolder}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  title="Create"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                  className="p-1.5 text-text-muted hover:bg-taupe-100 rounded-lg transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {folders.length === 0 && !loading && (
              <div className="text-center py-10 text-text-muted border-2 border-dashed border-taupe-200 rounded-xl">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No folders found. Click &quot;Refresh&quot; to fetch.</p>
              </div>
            )}

            {loading && folders.length === 0 && (
              <div className="text-center py-10 text-text-muted text-sm">Loading folders...</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {filteredFolders.map((f) => {
                const isSelected = selectedFolder === f.name;
                const isRenaming = renamingFolder === f.name;

                return (
                  <div
                    key={f.name}
                    data-item-card
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRenaming) {
                        setSelectedFolder(isSelected ? null : f.name);
                        if (renamingFolder && renamingFolder !== f.name) setRenamingFolder(null);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!isRenaming) handleOpenFolder(f.name);
                    }}
                    className={`relative flex flex-col items-center py-4 m-1 rounded-xl border cursor-pointer transition-all duration-150 group
                      ${isSelected
                        ? 'item-card-selected border-primary/40 bg-primary/5'
                        : 'border-taupe-200 bg-background hover:border-primary/30 hover:bg-taupe-50'
                      }`}
                  >
                    <FolderIcon
                      className="w-10 h-10 text-primary mb-2"
                      fill="currentColor"
                      fillOpacity={0.15}
                    />

                    {isRenaming ? (
                      <div className="flex items-center gap-1 w-full" data-item-action>
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameFolderValue}
                          onChange={(e) => setRenameFolderValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder();
                            if (e.key === 'Escape') setRenamingFolder(null);
                          }}
                          className="flex-1 min-w-0 text-xs bg-white border border-primary/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          data-item-action
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameFolder();
                          }}
                          className="p-0.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-text select-none truncate w-full text-center" title={f.name}>
                        {f.name}
                      </span>
                    )}

                    {/* Action buttons on selection */}
                    {isSelected && !isRenaming && (
                      <div className="flex items-center gap-1.5 mt-2 w-full justify-center" data-item-action>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenamingFolder(f.name);
                          }}
                          className="flex items-center gap-1 px-2 py-1 select-none text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="text-[10px] font-semibold tracking-wide">Rename</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(f.name);
                          }}
                          className="flex items-center gap-1 px-2 py-1 select-none text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="text-[10px] font-semibold tracking-wide">Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {searchQuery && filteredFolders.length === 0 && folders.length > 0 && (
              <div className="text-center py-6 text-text-muted text-xs">
                No folders matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        )}

        {/* ── Files View ── */}
        {currentFolder && (
          <div>
            {filesLoading && files.length === 0 && (
              <div className="text-center py-10 text-text-muted text-sm">Loading files...</div>
            )}

            {!filesLoading && files.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-taupe-200 rounded-xl">
                <div className="w-10 h-10 bg-taupe-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FolderOpen className="w-5 h-5 text-text-muted" />
                </div>
                <p className="text-text-muted text-sm mb-2">This folder is empty</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-primary text-xs font-semibold underline hover:text-primary/80"
                >
                  Upload files
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 mt-1 p-2 gap-2.5">
              {filteredFiles.map((f) => {
                const isSelected = selectedFile === f.name;
                const isRenaming = renamingFile === f.name;
                const fileType = detectFileType(f.name);
                const isDragging = draggedFile === f.name;

                return (
                  <div
                    key={f.name}
                    data-item-card
                    draggable={!isRenaming}
                    onDragStart={(e) => handleFileDragStart(e, f.name)}
                    onDragEnd={handleFileDragEnd}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRenaming) {
                        setSelectedFile(isSelected ? null : f.name);
                        if (renamingFile && renamingFile !== f.name) setRenamingFile(null);
                      }
                    }}
                    className={`group relative flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all duration-150
                      ${isDragging ? 'opacity-40 scale-95' : ''}
                      ${isSelected
                        ? 'item-card-selected border-primary/40 bg-primary/5'
                        : 'border-taupe-200 bg-background hover:border-primary/30 hover:bg-taupe-50'
                      }`}
                  >
                    {/* Thumbnail / Icon */}
                    <div className="relative w-full aspect-square rounded-lg bg-taupe-50 border border-taupe-200 overflow-hidden mb-2 flex items-center justify-center">
                      {/* Hover Copy URL Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(f.url);
                        }}
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm border border-taupe-200 shadow-sm px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 z-10 hover:bg-background text-text"
                        title="Copy URL"
                      >
                        {copiedUrl === f.url ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-primary" />}
                        <span className="text-[10px] font-bold">Copy URL</span>
                      </button>

                      {/* Hover Download Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadFile(f.name);
                        }}
                        disabled={downloading && downloadingFile === f.name}
                        className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm border border-taupe-200 shadow-sm p-1.5 rounded-lg flex items-center justify-center z-10 hover:bg-background text-text disabled:cursor-not-allowed disabled:opacity-60"
                        title={downloading && downloadingFile === f.name ? `Downloading ${downloadProgress}%` : 'Download File'}
                      >
                        {downloading && downloadingFile === f.name ? (
                          <span className="text-[10px] font-semibold">{downloadProgress}%</span>
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>

                      {fileType === 'image' ? (
                        <img
                          src={f.url}
                          alt={f.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent && !parent.querySelector('.fallback-icon')) {
                              const fallback = document.createElement('div');
                              fallback.className = 'fallback-icon flex items-center justify-center w-full h-full';
                              fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb09b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
                              parent.appendChild(fallback);
                            }
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1">
                          {getFileTypeIcon(f.name)}
                          <span className="text-[9px] text-text-muted font-medium uppercase">
                            {getFileExtension(f.name).replace('.', '')}
                          </span>
                        </div>
                      )}
                    </div>

                    {isRenaming ? (
                      <div className="flex items-center gap-1 w-full" data-item-action>
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameFileValue}
                          onChange={(e) => setRenameFileValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFile();
                            if (e.key === 'Escape') setRenamingFile(null);
                          }}
                          className="flex-1 min-w-0 text-[10px] bg-white border border-primary/40 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          data-item-action
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameFile();
                          }}
                          className="p-0.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className="text-[10px] font-medium text-text truncate w-full text-center leading-tight"
                        title={f.name}
                      >
                        {f.name}
                      </span>
                    )}

                    <span className="text-[9px] text-text-muted">
                      {formatSize(f.size)}
                    </span>

                    {/* Action buttons on selection */}
                    {isSelected && !isRenaming && (
                      <div className="flex items-center gap-1 mt-1.5 w-full justify-center flex-wrap" data-item-action>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenamingFile(f.name);
                          }}
                          className="flex items-center gap-0.5 px-1.5 py-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="text-[9px] font-semibold">Rename</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(f.name);
                          }}
                          className="flex items-center gap-0.5 px-1.5 py-1 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="text-[9px] font-semibold">Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {searchQuery && filteredFiles.length === 0 && files.length > 0 && (
              <div className="text-center py-6 text-text-muted text-xs">
                No files matching &quot;{searchQuery}&quot;{activeFilter !== 'all' ? ` (filter: ${activeFilter})` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
