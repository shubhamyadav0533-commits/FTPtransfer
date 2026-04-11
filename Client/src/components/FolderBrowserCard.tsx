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
  Clock,
  Sparkles,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { SftpCredentials, FolderEntry, FileEntry } from '../types';

interface Props {
  credentials: SftpCredentials;
  folders: FolderEntry[];
  setFolders: (f: FolderEntry[]) => void;
  onConfirmDelete: (message: string, action: () => void) => void;
  refreshTrigger: number;
}

export const FolderBrowserCard: React.FC<Props> = ({
  credentials,
  folders,
  setFolders,
  onConfirmDelete,
  refreshTrigger,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

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

  // Selection state
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Rename state
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameFileValue, setRenameFileValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Fetch Folders ───
  const handleFetchFolders = useCallback(async () => {
    if (!credentials.host || !credentials.user || !credentials.domain) {
      setError('Please fill in connection fields');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await ApiService.fetchFolders(credentials);
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
  }, [credentials, setFolders]);

  // ─── Fetch Files ───
  const handleOpenFolder = useCallback(
    async (folderName: string) => {
      setCurrentFolder(folderName);
      setFilesLoading(true);
      setError(null);
      setSuccess(null);
      setSelectedFile(null);
      setRenamingFile(null);
      try {
        const res = await ApiService.fetchFiles({ ...credentials, folder: folderName });
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

  // ─── Refresh (shared) ───
  const handleRefresh = useCallback(() => {
    if (currentFolder) {
      handleOpenFolder(currentFolder);
    } else {
      handleFetchFolders();
    }
  }, [currentFolder, handleOpenFolder, handleFetchFolders]);

  // Auto-refresh on upload trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // ─── Delete Folder ───
  const handleDeleteFolder = useCallback(
    (folderName: string) => {
      onConfirmDelete(`Delete folder "${folderName}" and ALL its contents? This cannot be undone.`, async () => {
        setLoading(true);
        try {
          const res = await ApiService.deleteFolder(credentials, folderName);
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

  // ─── Delete File ───
  const handleDeleteFile = useCallback(
    (filename: string) => {
      if (!currentFolder) return;
      onConfirmDelete(`Delete "${filename}" from "${currentFolder}"? This cannot be undone.`, async () => {
        setFilesLoading(true);
        try {
          const res = await ApiService.deleteFile({ ...credentials, folder: currentFolder }, filename);
          if (res.success) {
            setSelectedFile(null);
            await handleOpenFolder(currentFolder);
            // Also refresh folders in case it changes counts
            await handleFetchFolders();
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
    [credentials, currentFolder, handleOpenFolder, handleFetchFolders, onConfirmDelete]
  );

  // ─── Rename Folder ───
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
      const res = await ApiService.renameFolder(credentials, renamingFolder, renameFolderValue.trim());
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

  // ─── Rename File ───
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
      const res = await ApiService.renameFile(
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

  // ─── Copy URL ───
  const copyToClipboard = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }, []);

  // ─── Deselect on outside click ───
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If clicking on an item card or action button, skip
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

  // ─── Filter ───
  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isRefreshing = currentFolder ? filesLoading : loading;

  return (
    <section
      ref={cardRef}
      className="bg-card shadow-sm rounded-2xl border border-taupe-200 p-5 flex flex-col"
      style={{ minHeight: '420px', maxHeight: 'calc(100vh - 240px)' }}
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
              {currentFolder ? `📂 ${currentFolder}` : 'Folder Browser'}
            </h2>
          </div>
        </div>
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

      {/* ── Search Bar ── */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
        <input
          type="text"
          placeholder={currentFolder ? 'Search files...' : 'Search folders...'}
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
          className={`p-2.5 rounded-lg text-xs mb-3 flex items-center gap-2 ${
            error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error || success}
        </div>
      )}

      {/* ── Content Area ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Folders View */}
        {!currentFolder && (
          <div>
            {folders.length === 0 && !loading && (
              <div className="text-center py-10 text-text-muted border-2 border-dashed border-taupe-200 rounded-xl">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No folders found. Click &quot;Refresh&quot; to fetch.</p>
              </div>
            )}

            {loading && folders.length === 0 && (
              <div className="text-center py-10 text-text-muted text-sm">Loading folders...</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                    className={`relative flex flex-col items-center mx-1 px-2.5 py-3 my-1 rounded-xl border cursor-pointer transition-all duration-150 group
                      ${
                        isSelected
                          ? 'item-card-selected border-primary/40 bg-primary/5'
                          : 'border-taupe-200 bg-background hover:border-primary/30 hover:bg-taupe-50'
                      }`}
                  >
                    <FolderIcon
                      className="w-8 h-8 text-primary mb-1.5"
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
                      <span className="text-xs font-medium text-text truncate w-full text-center" title={f.name}>
                        {f.name}
                      </span>
                    )}

                    {/* Action buttons on selection */}
                    {isSelected && !isRenaming && (
                      <div className="flex items-center gap-1.5 mt-1.5 w-full justify-center" data-item-action>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenamingFolder(f.name);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
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
                          className="flex items-center gap-1 px-2 py-1 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

        {/* Files View */}
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
                <p className="text-text-muted text-sm">This folder is empty</p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredFiles.map((f) => {
                const isSelected = selectedFile === f.name;
                const isRenaming = renamingFile === f.name;

                return (
                  <div
                    key={f.name}
                    data-item-card
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRenaming) {
                        setSelectedFile(isSelected ? null : f.name);
                        if (renamingFile && renamingFile !== f.name) setRenamingFile(null);
                      }
                    }}
                    className={`group relative flex flex-col items-center p-2.5 m-1 rounded-xl border cursor-pointer transition-all duration-150
                      ${
                        isSelected
                          ? 'item-card-selected border-primary/40 bg-primary/5'
                          : 'border-taupe-200 bg-background hover:border-primary/30 hover:bg-taupe-50'
                      }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full aspect-square rounded-lg bg-taupe-50 border border-taupe-200 overflow-hidden mb-1.5 flex items-center justify-center">
                      
                      {/* Hover Copy Button */}
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
                      <img
                        src={f.url}
                        alt={f.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          // Show fallback icon
                          const parent = e.currentTarget.parentElement;
                          if (parent && !parent.querySelector('.fallback-icon')) {
                            const fallback = document.createElement('div');
                            fallback.className = 'fallback-icon flex items-center justify-center w-full h-full';
                            fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb09b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </div>

                    {/* New badge for files uploaded in last 24 hours */}
                    {f.modifiedAt && (Date.now() - f.modifiedAt < 24 * 60 * 60 * 1000) && (
                      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        <Sparkles className="w-2.5 h-2.5" />
                        New
                      </div>
                    )}

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

                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-text-muted">
                        {(f.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    {f.modifiedAt > 0 && (
                      <div className="flex items-center gap-0.5 mt-0.5" title={new Date(f.modifiedAt).toLocaleString()}>
                        <Clock className="w-2.5 h-2.5 text-text-muted" />
                        <span className="text-[8px] text-text-muted">
                          {new Date(f.modifiedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-[8px] text-text-muted">
                          {new Date(f.modifiedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                    )}

                    {/* Action buttons on selection */}
                    {isSelected && !isRenaming && (
                      <div className="flex items-center gap-1.5 mt-1 w-full justify-center" data-item-action>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRenamingFile(f.name);
                          }}
                          className="flex items-center gap-1 px-1.5 py-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3 h-3" />
                          <span className="text-[10px] font-semibold tracking-wide">Rename</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(f.name);
                          }}
                          className="flex items-center gap-1 px-1.5 py-1 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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

            {searchQuery && filteredFiles.length === 0 && files.length > 0 && (
              <div className="text-center py-6 text-text-muted text-xs">
                No files matching &quot;{searchQuery}&quot;
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
