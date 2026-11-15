import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert as MuiAlert,
  Box,
  Button,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import JSZip from 'jszip';
import { Zip, ZipPassThrough } from 'fflate';
import { showSaveFilePicker } from 'native-file-system-adapter';
import {
  FiX,
  FiTrash2,
  FiDownload,
  FiMove,
  FiEdit2,
  FiFolder,
  FiMoreVertical,
  FiEye,
  FiShare2,
  FiUpload,
  FiFolderPlus,
} from 'react-icons/fi';
import {
  DataGrid,
  GridCellParams,
  GridColDef,
  GridRenderCellParams,
  GridRowParams,
  GridSelectionModel,
} from '@mui/x-data-grid';
import { Alert, Button as BsButton, Spinner } from 'react-bootstrap';
import './App.css';
import buildColumns from './columns';
import DisboxFileManager, {
  FILE_DELIMITER,
  FileNode,
  detectExtensionDownloadSupport,
} from './disbox-file-manager';
import {
  encodeShareAttachmentUrls,
  formatSize,
  getAvailableFileName,
  getFilesFromDataTransfer,
  getMimeType,
  pickLocationAsWritable,
} from './file-utils';
import NavigationBar from './NavigationBar';
import PathParts from './PathParts';
import SearchBar from './SearchBar';
import ThemeSwitch from './ThemeSwitch';
import TransferManager from './components/TransferManager';
import type {
  DeleteDialogState,
  MoveDialogState,
  PreviewState,
  RenameDialogState,
  Severity,
  ShareDialogState,
  SnackbarState,
  TransferItem,
} from './types/app';
import { canPreviewFile, joinPath, makeId, normalizePath } from './utils/fileUi';

const darkTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#5865f2' } },
  shape: { borderRadius: 10 },
});

const lightTheme = createTheme({
  palette: { mode: 'light', primary: { main: '#5865f2' } },
  shape: { borderRadius: 10 },
});

function App() {
  const [fileManager, setFileManager] = useState<DisboxFileManager | null>(null);
  const [rows, setRows] = useState<FileNode[]>([]);
  const [theme, setTheme] = useState<boolean>(() => localStorage.getItem('theme') !== 'light');
  const [path, setPath] = useState<string | null>(null);
  const [searchOptions, setSearchOptions] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [initError, setInitError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectionModel, setSelectionModel] = useState<GridSelectionModel>([]);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);
  const [contextRow, setContextRow] = useState<FileNode | null>(null);
  const [preview, setPreview] = useState<PreviewState>({
    open: false,
    row: null,
    url: '',
    mime: '',
    loading: false,
    error: '',
  });
  const [moveDialog, setMoveDialog] = useState<MoveDialogState>({
    open: false,
    rows: [],
    target: '',
  });
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    open: false,
    row: null,
    value: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    rows: [],
    confirmText: '',
  });
  const [shareDialog, setShareDialog] = useState<ShareDialogState>({
    open: false,
    row: null,
    url: '',
    loading: false,
    error: '',
  });
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [transfersOpen, setTransfersOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const transferRunRef = useRef<Promise<void>>(Promise.resolve());
  const pauseRequestedRef = useRef<Record<string, boolean>>({});
  const transferStateRef = useRef<TransferItem[]>([]);
  useEffect(() => { transferStateRef.current = transfers; }, [transfers]);
  const isMobile = useMediaQuery('(max-width:900px)');
  const previewUrlRef = useRef<string>('');
  const [extensionStatus, setExtensionStatus] = useState<{
    available: boolean;
    canDirectDownload: boolean;
  }>({ available: false, canDirectDownload: false });
  const [encryptUploads, setEncryptUploads] = useState<boolean>(
    () => localStorage.getItem('disboxEncryptUploads') === 'true',
  );
  const [encryptionPassphrase, setEncryptionPassphrase] = useState<string>(
    () => localStorage.getItem('disboxEncryptionPassphrase') || '',
  );
  const [encryptionDialogOpen, setEncryptionDialogOpen] = useState<boolean>(false);

  const notify = useCallback((message: string, severity: Severity = 'info') => {
    setSnackbar({ open: true, message: String(message), severity });
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme ? 'dark' : 'light');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('disboxEncryptUploads', encryptUploads ? 'true' : 'false');
  }, [encryptUploads]);

  useEffect(() => {
    localStorage.setItem('disboxEncryptionPassphrase', encryptionPassphrase || '');
  }, [encryptionPassphrase]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    },
    [],
  );

  const refreshExtensionStatus = useCallback(async () => {
    try {
      const status = await detectExtensionDownloadSupport();
      setExtensionStatus(status);
      return status;
    } catch {
      const status = { available: false, canDirectDownload: false };
      setExtensionStatus(status);
      return status;
    }
  }, []);

  useEffect(() => {
    void refreshExtensionStatus();
    const onFocus = () => {
      void refreshExtensionStatus();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshExtensionStatus]);

  const refreshCurrentView = useCallback(
    (manager: DisboxFileManager | null, currentPath?: string | null) => {
      const p = currentPath ?? path;
      if (!manager) return;
      if (p === null) return;
      try {
        setRows(Object.values(manager.getChildren(p)));
      } catch {
        setRows([]);
      }
    },
    [path],
  );

  useEffect(() => {
    const webhookUrl = localStorage.getItem('webhookUrl');
    async function init() {
      if (!webhookUrl) {
        setLoading(false);
        return;
      }
      try {
        const manager = await DisboxFileManager.create(webhookUrl);
        setFileManager(manager);
        setRows(Object.values(manager.getChildren('')));
        setPath('');
      } catch (e: any) {
        setInitError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  const updateTransfer = useCallback((id: string, patch: Partial<TransferItem>) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const enqueueTransfers = useCallback(
    (items: Omit<TransferItem, 'id' | 'status' | 'progress' | 'error'>[]) => {
      const withIds: TransferItem[] = items.map((item) => ({
        id: makeId(),
        status: 'queued',
        progress: -1,
        error: '',
        ...item,
      }));
      setTransfers((prev) => [...withIds, ...prev].slice(0, 200));
      setTransfersOpen(true);
      return withIds.map((t) => t.id);
    },
    [],
  );

  const runTransfer = useCallback(
    async (id: string) => {
      await transferRunRef.current.catch(() => {});
      const task = () =>
        new Promise<void>((resolveTask) => {
          setTransfers((prev) => {
            const t = prev.find((x) => x.id === id);
            if (!t || !fileManager) {
              resolveTask();
              return prev;
            }
            if (t.status === 'running') {
              resolveTask();
              return prev;
            }
            void (async () => {
              updateTransfer(id, { status: 'running', progress: t.progress >= 0 ? t.progress : 0, error: '' });
              try {
                if (t.type === 'upload') {
                  const payload = t.payload as { file: File; targetPath: string; resume?: any; encrypted?: boolean };
                  const { file, targetPath } = payload;
                  pauseRequestedRef.current[id] = false;
                  const result = await fileManager.uploadFile(
                    targetPath,
                    file,
                    (value: number, total: number) => {
                      updateTransfer(id, {
                        progress: total > 0 ? Math.round((value / total) * 100) : 0,
                      });
                    },
                    {
                      ...(payload.encrypted && encryptionPassphrase
                        ? { encrypt: true, passphrase: encryptionPassphrase }
                        : payload.resume?.enc && encryptionPassphrase
                          ? { passphrase: encryptionPassphrase }
                          : {}),
                      resume: payload.resume || undefined,
                      shouldPause: () => Boolean(pauseRequestedRef.current[id]),
                    },
                  );
                  if ((result as any).status === 'paused') {
                    setTransfers((prev2) => prev2.map((x) => x.id === id ? {
                      ...x,
                      status: 'paused',
                      error: '',
                      payload: { ...x.payload, resume: (result as any).resume },
                    } : x));
                  } else {
                    updateTransfer(id, { status: 'completed', progress: 100 });
                    setTransfers((prev2) => prev2.map((x) => x.id === id ? { ...x, payload: { ...x.payload, resume: null } } : x));
                    const dir = targetPath.split(FILE_DELIMITER).slice(0, -1).join(FILE_DELIMITER);
                    if (normalizePath(dir) === normalizePath(path)) {
                      refreshCurrentView(fileManager, path);
                    }
                  }
                } else if (t.type === 'download') {
                  const { row } = t.payload as { row: FileNode };
                  let completedViaExtension = false;
                  if (extensionStatus.canDirectDownload) {
                    try {
                      updateTransfer(id, { progress: -1, error: '' });
                      const ok = await fileManager.downloadFileViaExtension(row.path as string);
                      if (ok) {
                        completedViaExtension = true;
                      } else {
                        notify(
                          `Extension download unavailable for "${row.name}", falling back to browser/proxy download.`,
                          'warning',
                        );
                      }
                    } catch (e: any) {
                      notify(
                        `Extension download failed for "${row.name}", falling back: ${e?.message || e}`,
                        'warning',
                      );
                    }
                  }
                  if (!completedViaExtension) {
                    const writable = await pickLocationAsWritable(row.name);
                    await fileManager.downloadFile(
                      row.path as string,
                      writable,
                      (value: number, total: number) => {
                        updateTransfer(id, {
                          progress: total > 0 ? Math.round((value / total) * 100) : 0,
                        });
                      },
                      encryptionPassphrase ? { passphrase: encryptionPassphrase } : undefined,
                    );
                  }
                  updateTransfer(id, { status: 'completed', progress: 100 });
                } else {
                  throw new Error('Unknown transfer type');
                }
              } catch (e: any) {
                updateTransfer(id, { status: 'failed', error: e?.message || String(e) });
                notify(
                  `${t.type === 'upload' ? 'Upload' : 'Download'} failed: ${e?.message || e}`,
                  'error',
                );
              } finally {
                delete pauseRequestedRef.current[id];
                resolveTask();
              }
            })();
            return prev.map((x) =>
              x.id === id ? { ...x, status: 'running', progress: x.progress >= 0 ? x.progress : 0, error: '' } : x,
            );
          });
        });
      transferRunRef.current = task();
      await transferRunRef.current.catch(() => {});
    },
    [
      encryptionPassphrase,
      extensionStatus.canDirectDownload,
      fileManager,
      notify,
      path,
      refreshCurrentView,
      updateTransfer,
    ],
  );

  const queueUploads = useCallback(
    async (files: any[]) => {
      if (!fileManager || path === null) return;
      const prepared: Omit<TransferItem, 'id' | 'status' | 'progress' | 'error'>[] = [];
      for (const item of files) {
        const file: File = item.file || item;
        const relativePath = String(
          item.path || (file as any).webkitRelativePath || file.name || '',
        ).replace(/\\/g, '/');
        if (!file || !relativePath) continue;
        const parts = relativePath.split('/').filter(Boolean);
        const originalName = parts.pop();
        if (!originalName) continue;
        const subdir = parts.join('/');
        const targetDir = subdir ? joinPath(path, subdir).replace(/^\//, FILE_DELIMITER) : path;
        try {
          if (subdir) {
            await fileManager.ensureDirectory(targetDir);
          }
          const fileName = await getAvailableFileName(fileManager, targetDir, originalName);
          const targetPath = `${targetDir}${FILE_DELIMITER}${fileName}`;
          prepared.push({
            type: 'upload',
            name: fileName,
            targetPath,
            payload: { file, targetPath, resume: null, encrypted: Boolean(encryptUploads && encryptionPassphrase) },
          });
        } catch (e: any) {
          notify(`Could not queue ${originalName}: ${e?.message || e}`, 'error');
        }
      }
      if (prepared.length === 0) return;
      const ids = enqueueTransfers(prepared);
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await runTransfer(id);
      }
      refreshCurrentView(fileManager, path);
    },
    [encryptUploads, encryptionPassphrase, enqueueTransfers, fileManager, notify, path, refreshCurrentView, runTransfer],
  );

  useEffect(() => {
    const overlay = document.getElementById('drag-overlay');
    if (!overlay) return;
    let active = false;
    let dragTimeout: any;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (path === null) return;
      if (!active) {
        active = true;
        overlay.style.display = 'flex';
      }
      clearTimeout(dragTimeout);
      dragTimeout = setTimeout(() => {
        active = false;
        overlay.style.display = 'none';
      }, 150);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      clearTimeout(dragTimeout);
      active = false;
      overlay.style.display = 'none';
      if (path === null) return;
      try {
        const files = await getFilesFromDataTransfer(e.dataTransfer as DataTransfer);
        await queueUploads(files);
      } catch (err: any) {
        notify(`Failed to read dropped files: ${err?.message || err}`, 'error');
      }
    };
    window.addEventListener('dragover', onDragOver as any);
    window.addEventListener('drop', onDrop as any);
    return () => {
      window.removeEventListener('dragover', onDragOver as any);
      window.removeEventListener('drop', onDrop as any);
      clearTimeout(dragTimeout);
    };
  }, [notify, path, queueUploads]);

  const showDirectory = useCallback(
    async (newPath: string) => {
      if (!fileManager) return;
      setPath(newPath);
      setSelectionModel([]);
      setRows(Object.values(fileManager.getChildren(newPath)));
    },
    [fileManager],
  );

  const onUploadFileClick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0 || path === null) return;
      await queueUploads(files.map((file) => ({ file, path: file.name })));
      event.target.value = '';
    },
    [path, queueUploads],
  );

  const onUploadFolderClick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0 || path === null) return;
      await queueUploads(
        files.map((file) => ({
          file,
          path: (file as any).webkitRelativePath || file.name,
        })),
      );
      event.target.value = '';
    },
    [path, queueUploads],
  );

  const getRowById = useCallback((id: any) => rows.find((row) => row.id === id), [rows]);

  const onCellEditCommit = useCallback(
    async (params: any) => {
      if (params.field !== 'name') return;
      const row = getRowById(params.id);
      if (!row || !fileManager) return;
      const newValue = String(params.value || '').trim();
      if (newValue === row.name) return;
      if (newValue.includes(FILE_DELIMITER)) {
        notify(`File name cannot contain "${FILE_DELIMITER}".`, 'error');
        refreshCurrentView(fileManager, path);
        return;
      }
      try {
        await fileManager.renameFile(row.path as string, newValue);
        refreshCurrentView(fileManager, path);
        notify('Renamed successfully', 'success');
      } catch (e: any) {
        notify(`Failed to rename file: ${e?.message || e}`, 'error');
        refreshCurrentView(fileManager, path);
      }
    },
    [fileManager, getRowById, notify, path, refreshCurrentView],
  );

  const onCellDoubleClick = useCallback(
    async (params: GridCellParams) => {
      if (params.field === 'name') return;
      if ((params.row as FileNode).type === 'directory') {
        await showDirectory((params.row as FileNode).path as string);
      }
    },
    [showDirectory],
  );

  const handlePreview = useCallback(
    async (row: FileNode) => {
      if (!fileManager || !row || row.type === 'directory') return;
      setPreview({
        open: true,
        row,
        url: '',
        mime: getMimeType(row.name),
        loading: true,
        error: '',
      });
      try {
        const chunks: Blob[] = [];
        const writable = {
          write: async (blob: Blob) => {
            chunks.push(blob);
          },
          close: async () => {},
        };
        await fileManager.downloadFile(
          row.path as string,
          writable,
          null,
          encryptionPassphrase ? { passphrase: encryptionPassphrase } : undefined,
        );
        const mime = getMimeType(row.name) || 'application/octet-stream';
        const blob = new Blob(chunks, { type: mime });
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview({ open: true, row, url, mime, loading: false, error: '' });
      } catch (e: any) {
        setPreview({
          open: true,
          row,
          url: '',
          mime: getMimeType(row.name),
          loading: false,
          error: e?.message || String(e),
        });
      }
    },
    [encryptionPassphrase, fileManager],
  );

  const generateShareUrl = useCallback(
    async (row: FileNode) => {
      if (!fileManager || !row || row.type === 'directory') return '';
      const attachmentUrls = await fileManager.getAttachmentUrls(row.path as string);
      const encoded = encodeShareAttachmentUrls(attachmentUrls);
      const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
      return `${window.location.origin}${basePath}/file?name=${encodeURIComponent(row.name)}&size=${encodeURIComponent(String(row.size || 0))}#${encoded}`;
    },
    [fileManager],
  );

  const openShareDialog = useCallback(
    async (row: FileNode) => {
      if (!fileManager || !row || row.type === 'directory') return;
      setShareDialog({ open: true, row, url: '', loading: true, error: '' });
      try {
        const url = await generateShareUrl(row);
        setShareDialog({ open: true, row, url, loading: false, error: '' });
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          notify('Share link copied to clipboard.', 'success');
        }
      } catch (e: any) {
        setShareDialog({
          open: true,
          row,
          url: '',
          loading: false,
          error: e?.message || String(e),
        });
      }
    },
    [fileManager, generateShareUrl, notify],
  );

  const handleShare = useCallback(
    async (row: FileNode) => {
      await openShareDialog(row);
    },
    [openShareDialog],
  );

  const collectFilesRecursive = useCallback(
    (dirPath: string): FileNode[] => {
      if (!fileManager) return [];
      const out: FileNode[] = [];
      const walk = (p: string) => {
        const children = Object.values(fileManager.getChildren(p) || {});
        for (const child of children) {
          if (child.type === 'directory') {
            walk(child.path as string);
          } else {
            out.push(child);
          }
        }
      };
      walk(dirPath);
      return out;
    },
    [fileManager],
  );

  const downloadFolderAsZip = useCallback(
    async (folder: FileNode) => {
      if (!fileManager) return;
      const files = collectFilesRecursive(folder.path as string);
      if (files.length === 0) {
        notify(`Folder "${folder.name}" is empty.`, 'warning');
        return;
      }

      const saveZipStream = async (suggestedName: string) => {
        try {
          const handle: any = await showSaveFilePicker({
            suggestedName,
            types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
          });
          const writable: any = await handle.createWritable();
          const writer = writable?.getWriter ? writable.getWriter() : writable;
          return {
            write: async (data: Uint8Array) => {
              await writer.write(data);
            },
            close: async () => {
              if (writer?.close) await writer.close();
              else if (writable?.close) await writable.close();
            },
            abort: async () => {
              try {
                if (writer?.abort) await writer.abort();
                else if (writable?.abort) await writable.abort();
              } catch {
                // ignore
              }
            },
          };
        } catch {
          return null;
        }
      };

      setBusy(true);
      notify(`Preparing zip for "${folder.name}" (${files.length} files)...`, 'info');
      const base = String(folder.path || '').replace(/^\/+|\/+$/g, '');
      const zipName = `${folder.name || 'folder'}.zip`;
      const out = await saveZipStream(zipName);

      try {
        // Streaming path (preferred): stream zip bytes to disk as files download.
        if (out) {
          try {
            let writeChain = Promise.resolve();
            let writeError: unknown = null;
            let finalized = false;
            let finalizeResolve: (() => void) | null = null;
            let finalizeReject: ((e: unknown) => void) | null = null;
            const finalizePromise = new Promise<void>((resolve, reject) => {
              finalizeResolve = resolve;
              finalizeReject = reject;
            });

            const zip = new Zip((err, data, final) => {
              if (err) {
                writeError = writeError || err;
                if (!finalized) finalizeReject?.(err);
                return;
              }
              writeChain = writeChain
                .then(async () => {
                  await out.write(data);
                  if (final && !finalized) {
                    finalized = true;
                    finalizeResolve?.();
                  }
                })
                .catch((e) => {
                  writeError = writeError || e;
                  if (!finalized) finalizeReject?.(e);
                  throw e;
                });
            });

            for (let i = 0; i < files.length; i++) {
              if (writeError) throw writeError;
              const file = files[i];
              const rel =
                String(file.path || '')
                  .replace(/^\/+/, '')
                  .slice(base.length)
                  .replace(/^\/+/, '') || file.name;
              const entry = new ZipPassThrough(rel);
              zip.add(entry);

              const writable = {
                write: async (data: Blob | BufferSource | string) => {
                  let u8: Uint8Array;
                  if (data instanceof Uint8Array) u8 = data;
                  else if (data instanceof Blob) u8 = new Uint8Array(await data.arrayBuffer());
                  else if (typeof data === 'string') u8 = new TextEncoder().encode(data);
                  else if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
                  else {
                    const view = data as ArrayBufferView;
                    u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                  }
                  entry.push(u8);
                },
                close: async () => {
                  entry.push(new Uint8Array(0), true);
                },
              };

              // eslint-disable-next-line no-await-in-loop
              await fileManager.downloadFile(
                file.path as string,
                writable,
                null,
                encryptionPassphrase ? { passphrase: encryptionPassphrase } : undefined,
              );

              if ((i + 1) % 3 === 0 || i === files.length - 1) {
                notify(`Streaming zip "${folder.name}": ${i + 1}/${files.length} files`, 'info');
              }
            }

            zip.end();
            await finalizePromise;
            await writeChain;
            await out.close();
            notify(`Downloaded "${folder.name}.zip" (streamed).`, 'success');
            return;
          } catch (e: any) {
            try {
              await out.abort();
            } catch {}
            notify(`Failed to stream zip, falling back: ${e?.message || e}`, 'warning');
            // fall through to in-memory fallback
          }
        }

        // Fallback (non-streaming destination): build zip in memory (higher RAM usage).
        const zip = new JSZip();
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const rel =
            String(file.path || '')
              .replace(/^\/+/, '')
              .slice(base.length)
              .replace(/^\/+/, '') || file.name;
          const chunks: Blob[] = [];
          const writable = {
            write: async (blob: Blob) => {
              chunks.push(blob);
            },
            close: async () => {},
          };
          // eslint-disable-next-line no-await-in-loop
          await fileManager.downloadFile(
            file.path as string,
            writable,
            null,
            encryptionPassphrase ? { passphrase: encryptionPassphrase } : undefined,
          );
          zip.file(rel, new Blob(chunks));
          if ((i + 1) % 3 === 0 || i === files.length - 1) {
            notify(`Zipping "${folder.name}": ${i + 1}/${files.length} files`, 'info');
          }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        notify(`Downloaded "${folder.name}.zip".`, 'success');
      } catch (e: any) {
        notify(`Failed to download folder as zip: ${e?.message || e}`, 'error');
      } finally {
        setBusy(false);
      }
    },
    [collectFilesRecursive, encryptionPassphrase, fileManager, notify],
  );

  const handleDownloadRows = useCallback(
    async (rowsToDownload: FileNode[]) => {
      const dirs = rowsToDownload.filter((r) => r && r.type === 'directory');
      const files = rowsToDownload.filter((r) => r && r.type !== 'directory');
      if (dirs.length === 1 && files.length === 0) {
        await downloadFolderAsZip(dirs[0]);
        return;
      }
      if (dirs.length > 0) {
        notify(
          'Folder download as zip supports one folder at a time. Downloading selected files only.',
          'warning',
        );
      }
      if (files.length === 0) {
        if (dirs.length === 0) notify('Select one or more files to download.', 'warning');
        return;
      }
      const ids = enqueueTransfers(
        files.map((row) => ({
          type: 'download' as const,
          name: row.name,
          targetPath: row.path as string,
          payload: { row },
        })),
      );
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await runTransfer(id);
      }
    },
    [downloadFolderAsZip, enqueueTransfers, notify, runTransfer],
  );

  const handleDeleteRows = useCallback(
    async (rowsToDelete: FileNode[]) => {
      if (!fileManager || rowsToDelete.length === 0) return;
      setDeleteDialog({ open: true, rows: rowsToDelete, confirmText: '' });
    },
    [fileManager],
  );

  const confirmDeleteRows = useCallback(async () => {
    if (!fileManager || deleteDialog.rows.length === 0) return;
    const required = deleteDialog.rows.length > 1 ? 'DELETE' : deleteDialog.rows[0].name;
    if (deleteDialog.confirmText !== required) {
      notify(`Type "${required}" to confirm deletion.`, 'warning');
      return;
    }
    const rowsToDelete = deleteDialog.rows;
    setDeleteDialog({ open: false, rows: [], confirmText: '' });
    setBusy(true);
    try {
      for (const row of rowsToDelete) {
        // eslint-disable-next-line no-await-in-loop
        await fileManager.deleteFile(row.path as string, null);
      }
      notify(`Deleted ${rowsToDelete.length} item(s).`, 'success');
      setSelectionModel([]);
      refreshCurrentView(fileManager, path);
    } catch (e: any) {
      notify(`Failed to delete: ${e?.message || e}`, 'error');
      refreshCurrentView(fileManager, path);
    } finally {
      setBusy(false);
    }
  }, [deleteDialog.confirmText, deleteDialog.rows, fileManager, notify, path, refreshCurrentView]);

  const openMoveDialog = useCallback((rowsToMove: FileNode[]) => {
    setMoveDialog({ open: true, rows: rowsToMove, target: '' });
  }, []);

  const handleMove = useCallback(async () => {
    if (!fileManager || moveDialog.rows.length === 0) return;
    const target = normalizePath(moveDialog.target);
    const targetDirPath = target ? `/${target}` : '';
    try {
      setBusy(true);
      if (target) {
        await fileManager.ensureDirectory(targetDirPath);
      }
      let moved = 0;
      let renamed = 0;
      for (const row of moveDialog.rows) {
        const destPath = `${targetDirPath}${FILE_DELIMITER}${row.name}`.replace(/\/+/g, '/');
        const conflict = fileManager.getFile(destPath);
        let sourcePath = row.path as string;
        if (conflict) {
          const shouldRename = window.confirm(
            `"${row.name}" already exists in the destination. Rename and move it? (Cancel to skip this item)`,
          );
          if (!shouldRename) continue;
          const availableName = await getAvailableFileName(
            fileManager,
            targetDirPath || '',
            row.name,
          );
          // eslint-disable-next-line no-await-in-loop
          await fileManager.renameFile(sourcePath, availableName);
          const parts = sourcePath.split(FILE_DELIMITER);
          parts[parts.length - 1] = availableName;
          sourcePath = parts.join(FILE_DELIMITER);
          renamed++;
        }
        // eslint-disable-next-line no-await-in-loop
        await fileManager.moveFile(sourcePath, targetDirPath);
        moved++;
      }
      notify(
        `Moved ${moved} item(s)${renamed ? ` (${renamed} renamed to avoid conflicts)` : ''}.`,
        'success',
      );
      setMoveDialog({ open: false, rows: [], target: '' });
      setSelectionModel([]);
      refreshCurrentView(fileManager, path);
    } catch (e: any) {
      notify(`Failed to move: ${e?.message || e}`, 'error');
      refreshCurrentView(fileManager, path);
    } finally {
      setBusy(false);
    }
  }, [fileManager, moveDialog.rows, moveDialog.target, notify, path, refreshCurrentView]);

  const openRenameDialog = useCallback((row: FileNode) => {
    setRenameDialog({ open: true, row, value: row?.name || '' });
  }, []);

  const handleRenameDialog = useCallback(async () => {
    const { row, value } = renameDialog;
    if (!fileManager || !row) return;
    const newValue = String(value || '').trim();
    if (!newValue || newValue === row.name) {
      setRenameDialog({ open: false, row: null, value: '' });
      return;
    }
    try {
      await fileManager.renameFile(row.path as string, newValue);
      notify('Renamed successfully', 'success');
      setRenameDialog({ open: false, row: null, value: '' });
      refreshCurrentView(fileManager, path);
    } catch (e: any) {
      notify(`Failed to rename: ${e?.message || e}`, 'error');
    }
  }, [fileManager, notify, path, refreshCurrentView, renameDialog]);

  const onNewFolderClick = useCallback(async () => {
    if (!fileManager || path === null) return;
    try {
      const folderName = await getAvailableFileName(fileManager, path, 'New Folder');
      await fileManager.createDirectory(`${path}${FILE_DELIMITER}${folderName}`);
      refreshCurrentView(fileManager, path);
      notify('Folder created.', 'success');
    } catch (e: any) {
      notify(`Failed to create folder: ${e?.message || e}`, 'error');
    }
  }, [fileManager, notify, path, refreshCurrentView]);

  const showSearchResults = useCallback(
    (value: string | null = null) => {
      if (!fileManager) return;
      const searchValueToUse = value === null ? searchValue : value;
      if (!searchValueToUse) return;
      const file = fileManager.getFile(searchValueToUse);
      if (file && file.type === 'directory') {
        void showDirectory(searchValueToUse);
        return;
      }
      const fileOptions = searchOptions
        .map((option) => fileManager.getFile(option))
        .filter(Boolean) as FileNode[];
      setRows(fileOptions);
      setPath(null);
      setSelectionModel([]);
    },
    [fileManager, searchOptions, searchValue, showDirectory],
  );

  const selectedRows = useMemo(() => {
    const set = new Set(selectionModel as any[]);
    return rows.filter((r) => set.has(r.id));
  }, [rows, selectionModel]);

  const directories = useMemo(() => {
    if (!fileManager) return [] as string[];
    // Recompute when current view data changes (tree mutations update manager in-place).
    void rows;
    const out: string[] = [];
    const walk = (p: string) => {
      let children: Record<string, FileNode> = {};
      try {
        children = fileManager.getChildren(p);
      } catch {
        children = {};
      }
      Object.values(children).forEach((child) => {
        if (child.type === 'directory') {
          out.push(child.path as string);
          walk(child.path as string);
        }
      });
    };
    walk('');
    return out.sort();
  }, [fileManager, rows]);

  const safeFileManager = useMemo(
    () =>
      (fileManager || {
        getFile: () => null,
        getChildren: () => ({}),
      }) as any,
    [fileManager],
  );

  const columns = useMemo(() => {
    const cols = buildColumns(
      safeFileManager,
      busy ? 'busy' : '',
      (params: GridRenderCellParams) => handleShare(params.row as FileNode),
      (params: GridRenderCellParams) => void handleDownloadRows([params.row as FileNode]),
      (params: GridRenderCellParams) => void handleDeleteRows([params.row as FileNode]),
    ).map((col) => {
      if (col.field === 'path') return { ...col, hide: path !== null } as GridColDef;
      if (
        isMobile &&
        (col.field === 'created_at' || col.field === 'updated_at' || col.field === 'share')
      ) {
        return { ...col, hide: true } as GridColDef;
      }
      return col;
    });
    if (!isMobile) {
      cols.push({
        field: 'actions',
        headerName: 'More',
        width: 80,
        sortable: false,
        disableColumnMenu: true,
        renderCell: (params: GridRenderCellParams) => (
          <IconButton
            aria-label={`More actions for ${params.row.name}`}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setContextRow(params.row as FileNode);
              setContextMenu({ mouseX: e.clientX + 2, mouseY: e.clientY - 6 });
            }}
          >
            <FiMoreVertical />
          </IconButton>
        ),
      });
    }
    return cols;
  }, [busy, handleDeleteRows, handleDownloadRows, handleShare, isMobile, path, safeFileManager]);

  const closeContextMenu = () => setContextMenu(null);

  const contextActions = useMemo(() => {
    const row = contextRow;
    if (!row) return [] as Array<{ label: string; icon: React.ReactNode; action: () => void }>;
    return [
      row.type === 'directory' && {
        label: 'Open',
        icon: <FiFolder />,
        action: () => void showDirectory(row.path as string),
      },
      row.type !== 'directory' &&
        canPreviewFile(row.name, row.size) && {
          label: 'Preview',
          icon: <FiEye />,
          action: () => void handlePreview(row),
        },
      row.type !== 'directory' && {
        label: 'Download',
        icon: <FiDownload />,
        action: () => void handleDownloadRows([row]),
      },
      row.type !== 'directory' && {
        label: 'Copy share link',
        icon: <FiShare2 />,
        action: () => void handleShare(row),
      },
      { label: 'Rename', icon: <FiEdit2 />, action: () => openRenameDialog(row) },
      { label: 'Move', icon: <FiMove />, action: () => openMoveDialog([row]) },
      { label: 'Delete', icon: <FiTrash2 />, action: () => void handleDeleteRows([row]) },
    ].filter(Boolean) as Array<{ label: string; icon: React.ReactNode; action: () => void }>;
  }, [
    contextRow,
    handleDeleteRows,
    handleDownloadRows,
    handlePreview,
    handleShare,
    openMoveDialog,
    openRenameDialog,
    showDirectory,
  ]);

  const pauseTransfer = useCallback(async (id: string) => {
    const t = transferStateRef.current.find((x) => x.id === id);
    if (!t || t.type !== 'upload' || t.status !== 'running') return;
    pauseRequestedRef.current[id] = true;
    updateTransfer(id, { error: 'Pausing...' });
  }, [updateTransfer]);

  const resumeTransfer = useCallback(async (id: string) => {
    const t = transferStateRef.current.find((x) => x.id === id);
    if (!t || t.type !== 'upload' || t.status !== 'paused') return;
    setTransfers((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'queued', error: '' } : x)));
    await runTransfer(id);
  }, [runTransfer]);

  const retryTransfer = useCallback(
    async (id: string) => {
      const t = transfers.find((x) => x.id === id);
      if (!t) return;
      setTransfers((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: 'queued', progress: -1, error: '' } : x)),
      );
      await runTransfer(id);
    },
    [runTransfer, transfers],
  );

  const runningCount = transfers.filter(
    (t) => t.status === 'running' || t.status === 'queued',
  ).length;
  const failedCount = transfers.filter((t) => t.status === 'failed').length;

  const rootContent = (() => {
    if (loading) {
      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '60vh',
          }}
        >
          <Spinner animation="border" />{' '}
          <span style={{ marginLeft: 12 }}>Loading your storage...</span>
        </Box>
      );
    }
    if (initError) {
      return (
        <Box sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
          <Alert variant="danger">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Could not load your Disbox storage
            </div>
            <div style={{ marginBottom: 12 }}>{initError}</div>
            <BsButton
              variant="outline-danger"
              onClick={() => {
                localStorage.removeItem('webhookUrl');
                window.location.href =
                  (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/setup';
              }}
            >
              Change webhook URL
            </BsButton>
          </Alert>
        </Box>
      );
    }
    return null;
  })();

  return (
    <ThemeProvider theme={theme ? darkTheme : lightTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', pb: 2 }}>
        <NavigationBar />
        <div
          id="drag-overlay"
          style={
            {
              display: 'none',
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              border: '4px dashed #4ade80',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              color: 'white',
              zIndex: 9999,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            } as React.CSSProperties
          }
        >
          <span style={{ fontSize: '4rem' }}>📂</span>
          <span>Drop files or folders to upload</span>
        </div>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={4500}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <MuiAlert
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </MuiAlert>
        </Snackbar>

        <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Box sx={{ width: { xs: '100%', md: 420 } }}>
            <SearchBar
              fileManager={fileManager}
              files={true}
              directories={true}
              advanced={true}
              rows={rows}
              search={true}
              onOptionsChanged={(options) => setSearchOptions(options)}
              onChange={(value) => setSearchValue(value)}
              onSelect={showSearchResults}
              onEnter={showSearchResults}
              placeholder="Search files, folders, or ext:png"
            />
          </Box>

          <input
            id="uploadFile"
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={onUploadFileClick}
          />
          <input
            id="uploadFolder"
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={onUploadFolderClick}
            {...({ webkitdirectory: '', directory: '' } as any)}
          />
          <Tooltip title="Upload files to the current folder">
            <span>
              <Button
                variant="contained"
                startIcon={<FiUpload />}
                onClick={() =>
                  (document.getElementById('uploadFile') as HTMLInputElement | null)?.click()
                }
                disabled={path === null || busy}
              >
                Upload files
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Upload a folder (preserves structure)">
            <span>
              <Button
                variant="outlined"
                startIcon={<FiUpload />}
                onClick={() =>
                  (document.getElementById('uploadFolder') as HTMLInputElement | null)?.click()
                }
                disabled={path === null || busy}
              >
                Upload folder
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Create a new folder">
            <span>
              <Button
                variant="outlined"
                startIcon={<FiFolderPlus />}
                onClick={onNewFolderClick}
                disabled={path === null || busy}
              >
                New folder
              </Button>
            </span>
          </Tooltip>
          <Button variant="outlined" onClick={() => setTransfersOpen(true)}>
            Transfers{runningCount ? ` (${runningCount})` : ''}
            {failedCount ? `, ${failedCount} failed` : ''}
          </Button>
          <Tooltip title="Configure client-side encryption for new uploads">
            <Chip
              size="small"
              clickable
              onClick={() => setEncryptionDialogOpen(true)}
              color={encryptUploads && encryptionPassphrase ? 'success' : 'default'}
              label={
                encryptUploads && encryptionPassphrase
                  ? 'Encryption: on'
                  : encryptUploads
                    ? 'Encryption: needs passphrase'
                    : 'Encryption: off'
              }
              variant={encryptUploads ? 'filled' : 'outlined'}
            />
          </Tooltip>
          <Tooltip title="Click to re-check extension">
            <Chip
              size="small"
              clickable
              onClick={() => {
                void refreshExtensionStatus().then((s) =>
                  notify(
                    s.available ? 'Extension detected.' : 'Extension not detected.',
                    s.available ? 'success' : 'info',
                  ),
                );
              }}
              color={extensionStatus.available ? 'success' : 'default'}
              label={
                extensionStatus.available
                  ? extensionStatus.canDirectDownload
                    ? 'Extension: direct download'
                    : 'Extension: available'
                  : 'Extension: not detected'
              }
              variant={extensionStatus.available ? 'filled' : 'outlined'}
            />
          </Tooltip>

          {selectedRows.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              alignItems="center"
              sx={{ ml: { md: 'auto' } }}
            >
              <Chip label={`${selectedRows.length} selected`} color="primary" />
              <Button
                size="small"
                onClick={() => void handleDownloadRows(selectedRows)}
                disabled={busy}
              >
                Download
              </Button>
              <Button size="small" onClick={() => openMoveDialog(selectedRows)} disabled={busy}>
                Move
              </Button>
              <Button
                size="small"
                color="error"
                onClick={() => void handleDeleteRows(selectedRows)}
                disabled={busy}
              >
                Delete
              </Button>
              {selectedRows.length === 1 && selectedRows[0].type !== 'directory' && (
                <Button size="small" onClick={() => void handleShare(selectedRows[0])}>
                  Copy link
                </Button>
              )}
              {selectedRows.length === 1 && (
                <Button size="small" onClick={() => openRenameDialog(selectedRows[0])}>
                  Rename
                </Button>
              )}
            </Stack>
          )}
        </Box>

        <PathParts path={path} fileManager={fileManager} showDirectory={showDirectory} />

        {path === null && !rootContent && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Alert variant="info">
              Showing search results. Open a folder or clear search to browse normally.
            </Alert>
          </Box>
        )}

        {rootContent ? (
          rootContent
        ) : (
          <Box sx={{ height: { xs: '65vh', md: '72vh' }, width: '100%', p: 2 }}>
            <DataGrid
              sx={{
                width: 1,
                border: 0,
                '& .MuiDataGrid-row': { cursor: 'pointer' },
                '& .MuiDataGrid-cell--editing': {
                  bgcolor: 'rgb(255,215,115, 0.19)',
                  color: '#1a3e72',
                },
              }}
              rows={rows}
              columns={columns}
              checkboxSelection
              disableSelectionOnClick
              selectionModel={selectionModel}
              onSelectionModelChange={(m) => setSelectionModel(m as GridSelectionModel)}
              onCellEditCommit={onCellEditCommit}
              onCellDoubleClick={(params) => {
                const row = params.row as FileNode;
                if (
                  params.field !== 'name' &&
                  row.type !== 'directory' &&
                  canPreviewFile(row.name, row.size)
                ) {
                  void handlePreview(row);
                } else {
                  void onCellDoubleClick(params);
                }
              }}
              onRowDoubleClick={(params: GridRowParams) => {
                const row = params.row as FileNode;
                if (row.type === 'directory') void showDirectory(row.path as string);
                else if (canPreviewFile(row.name, row.size)) void handlePreview(row);
              }}
              onRowClick={(params: GridRowParams) => {
                if (!isMobile) return;
                const row = params.row as FileNode;
                if (row.type === 'directory') void showDirectory(row.path as string);
                else if (canPreviewFile(row.name, row.size)) void handlePreview(row);
              }}
              components={{
                NoRowsOverlay: () => (
                  <Stack height="100%" alignItems="center" justifyContent="center" spacing={1}>
                    <Typography color="text.secondary">
                      {path === null ? 'No matching results.' : 'This folder is empty.'}
                    </Typography>
                    {path !== null && (
                      <Typography variant="body2" color="text.secondary">
                        Upload files or create a folder to get started.
                      </Typography>
                    )}
                  </Stack>
                ),
              }}
              hideFooter={rows.length <= 100}
              pageSize={100}
              rowsPerPageOptions={[25, 50, 100]}
              density={isMobile ? 'compact' : 'standard'}
            />
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 2,
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Tip: double-click folders to open, double-click supported files to preview, use More
            actions for file operations.
          </Typography>
          <ThemeSwitch theme={theme} setTheme={setTheme} />
        </Box>

        <Menu
          open={contextMenu !== null}
          onClose={closeContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
          }
        >
          {contextActions.map((a) => (
            <MenuItem
              key={a.label}
              onClick={() => {
                closeContextMenu();
                a.action();
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                {a.icon}
                <span>{a.label}</span>
              </Stack>
            </MenuItem>
          ))}
        </Menu>

        <Dialog
          open={preview.open}
          onClose={() => setPreview((p) => ({ ...p, open: false }))}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle sx={{ pr: 6 }}>
            {preview.row?.name || 'Preview'}
            <IconButton
              aria-label="Close preview"
              onClick={() => setPreview((p) => ({ ...p, open: false }))}
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <FiX />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {preview.loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <Spinner animation="border" />
              </Box>
            )}
            {!preview.loading && preview.error && (
              <MuiAlert severity="error">{preview.error}</MuiAlert>
            )}
            {!preview.loading && !preview.error && preview.url && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                {preview.mime.startsWith('image/') && (
                  <img
                    src={preview.url}
                    alt={preview.row?.name || 'preview'}
                    style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                  />
                )}
                {preview.mime.startsWith('video/') && (
                  <video
                    src={preview.url}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '70vh' }}
                  />
                )}
                {preview.mime.startsWith('audio/') && (
                  <audio src={preview.url} controls style={{ width: '100%' }} />
                )}
                {preview.mime === 'application/pdf' && (
                  <iframe
                    title="PDF preview"
                    src={preview.url}
                    style={{ width: '100%', height: '70vh', border: 0 }}
                  />
                )}
                {(preview.mime.startsWith('text/') || preview.mime === 'application/json') && (
                  <iframe
                    title="Text preview"
                    src={preview.url}
                    style={{
                      width: '100%',
                      height: '70vh',
                      border: '1px solid rgba(128,128,128,0.3)',
                    }}
                  />
                )}
              </Box>
            )}
            {!preview.loading && !preview.error && !preview.url && (
              <Typography color="text.secondary">Preview not available.</Typography>
            )}
          </DialogContent>
          <DialogActions>
            {preview.row && (
              <Button
                onClick={() => void handleShare(preview.row as FileNode)}
                startIcon={<FiShare2 />}
              >
                Copy link
              </Button>
            )}
            {preview.row && (
              <Button
                onClick={() => void handleDownloadRows([preview.row as FileNode])}
                startIcon={<FiDownload />}
              >
                Download
              </Button>
            )}
          </DialogActions>
        </Dialog>

        <Dialog
          open={moveDialog.open}
          onClose={() => setMoveDialog({ open: false, rows: [], target: '' })}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Move {moveDialog.rows.length} item(s)</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter a destination folder path relative to storage root (leave empty for root).
              Example: <code>photos/2026</code>
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Destination folder"
              value={moveDialog.target}
              onChange={(e) => setMoveDialog((d) => ({ ...d, target: e.target.value }))}
              placeholder="e.g. documents/work"
              helperText="The folder will be created if it does not exist."
            />
            {directories.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Existing folders:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, gap: 1 }}>
                  {directories.slice(0, 30).map((d) => (
                    <Chip
                      key={d}
                      label={String(d).replace(/^\/+/, '')}
                      size="small"
                      onClick={() =>
                        setMoveDialog((m) => ({ ...m, target: String(d).replace(/^\/+/, '') }))
                      }
                      clickable
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMoveDialog({ open: false, rows: [], target: '' })}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void handleMove()} disabled={busy}>
              Move
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={renameDialog.open}
          onClose={() => setRenameDialog({ open: false, row: null, value: '' })}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Rename</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              label="New name"
              value={renameDialog.value}
              onChange={(e) => setRenameDialog((d) => ({ ...d, value: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameDialog();
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog({ open: false, row: null, value: '' })}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void handleRenameDialog()}>
              Save
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={deleteDialog.open}
          onClose={() => setDeleteDialog({ open: false, rows: [], confirmText: '' })}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Confirm deletion</DialogTitle>
          <DialogContent>
            <MuiAlert severity="warning" sx={{ mb: 2 }}>
              This permanently deletes the selected item(s) from Disbox/Discord storage. This cannot
              be undone.
            </MuiAlert>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {deleteDialog.rows.length === 1
                ? `Type "${deleteDialog.rows[0]?.name || ''}" to confirm.`
                : `Type "DELETE" to confirm deleting ${deleteDialog.rows.length} items.`}
            </Typography>
            {deleteDialog.rows.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Items:{' '}
                {deleteDialog.rows
                  .map((r) => r.name)
                  .slice(0, 5)
                  .join(', ')}
                {deleteDialog.rows.length > 5 ? ` (+${deleteDialog.rows.length - 5} more)` : ''}
              </Typography>
            )}
            <TextField
              autoFocus
              fullWidth
              label="Confirmation"
              value={deleteDialog.confirmText}
              onChange={(e) => setDeleteDialog((d) => ({ ...d, confirmText: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmDeleteRows();
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialog({ open: false, rows: [], confirmText: '' })}>
              Cancel
            </Button>
            <Button color="error" variant="contained" onClick={() => void confirmDeleteRows()}>
              Delete permanently
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={shareDialog.open}
          onClose={() =>
            setShareDialog({ open: false, row: null, url: '', loading: false, error: '' })
          }
          fullWidth
          maxWidth="md"
        >
          <DialogTitle>Share file</DialogTitle>
          <DialogContent>
            {shareDialog.row && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>{shareDialog.row.name}</strong> (
                {formatSize(shareDialog.row.size as any) || 'unknown size'})
              </Typography>
            )}
            <MuiAlert severity="info" sx={{ mb: 2 }}>
              Share links contain encoded attachment references. They work while the underlying
              Discord attachment URLs remain valid and can expire/regenerate over time; use
              “Regenerate link” to fetch fresh URLs.
            </MuiAlert>
            {shareDialog.row && fileManager?.isFileEncrypted(shareDialog.row.path as string) && (
              <MuiAlert severity="warning" sx={{ mb: 2 }}>
                This file is encrypted. The share link does not include the encryption passphrase,
                so recipients cannot auto-decrypt it from the link alone.
              </MuiAlert>
            )}
            {shareDialog.loading && (
              <Typography color="text.secondary">Generating link...</Typography>
            )}
            {shareDialog.error && <MuiAlert severity="error">{shareDialog.error}</MuiAlert>}
            {shareDialog.url && (
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Share link"
                value={shareDialog.url}
                InputProps={{ readOnly: true }}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() =>
                setShareDialog({ open: false, row: null, url: '', loading: false, error: '' })
              }
            >
              Close
            </Button>
            {shareDialog.row && (
              <Button
                onClick={() => void openShareDialog(shareDialog.row as FileNode)}
                disabled={shareDialog.loading}
              >
                Regenerate link
              </Button>
            )}
            <Button
              variant="contained"
              disabled={!shareDialog.url}
              onClick={async () => {
                if (!shareDialog.url) return;
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(shareDialog.url);
                  notify('Share link copied to clipboard.', 'success');
                } else {
                  window.prompt('Copy this share link:', shareDialog.url);
                }
              }}
            >
              Copy link
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={encryptionDialogOpen}
          onClose={() => setEncryptionDialogOpen(false)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Client-side encryption</DialogTitle>
          <DialogContent>
            <MuiAlert severity="info" sx={{ mb: 2 }}>
              When enabled, new uploads are encrypted in your browser before chunks are sent to
              Discord. Downloads/previews are auto-decrypted in this app when the correct passphrase
              is configured.
            </MuiAlert>
            <MuiAlert severity="warning" sx={{ mb: 2 }}>
              The passphrase is stored in this browser&apos;s local storage for convenience. If you
              forget it, encrypted files cannot be recovered. Encrypted share links do not include
              the passphrase.
            </MuiAlert>
            <FormControlLabel
              control={
                <Switch
                  checked={encryptUploads}
                  onChange={(e) => setEncryptUploads(e.target.checked)}
                />
              }
              label="Encrypt new uploads"
            />
            <TextField
              fullWidth
              margin="dense"
              type="password"
              label="Encryption passphrase"
              value={encryptionPassphrase}
              onChange={(e) => setEncryptionPassphrase(e.target.value)}
              helperText="Required for encrypted uploads and to auto-decrypt encrypted downloads/previews."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEncryptionDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        <TransferManager
          open={transfersOpen}
          onClose={() => setTransfersOpen(false)}
          transfers={transfers}
          onRetry={(id) => void retryTransfer(id)}
          onPause={(id) => void pauseTransfer(id)}
          onResume={(id) => void resumeTransfer(id)}
          onClearCompleted={() =>
            setTransfers((prev) =>
              prev.filter(
                (t) =>
                  t.status === 'running' ||
                  t.status === 'queued' ||
                  t.status === 'failed' ||
                  t.status === 'paused',
              ),
            )
          }
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;
