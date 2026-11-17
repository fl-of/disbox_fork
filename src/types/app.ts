import type { FileNode } from '../disbox-file-manager';

export type Severity = 'success' | 'info' | 'warning' | 'error';

export interface UploadResumeState {
  messageIds: string[];
  uploadedBytes: number;
  totalBytes: number;
  encrypted: boolean;
}

export interface TransferItem {
  id: string;
  type: 'upload' | 'download';
  name: string;
  targetPath: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  error: string;
  payload: any;
  /** Bytes transferred so far (best effort). */
  bytesTransferred?: number;
  /** Total bytes if known. */
  totalBytes?: number;
  /** Smoothed transfer speed in bytes/sec (best effort). */
  speedBps?: number;
  /** Estimated seconds remaining (best effort). */
  etaSeconds?: number;
  /** Timestamp (ms) used for speed/ETA calculation. */
  progressUpdatedAt?: number;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: Severity;
}

export interface PreviewState {
  open: boolean;
  row: FileNode | null;
  url: string;
  mime: string;
  loading: boolean;
  error: string;
}

export interface MoveDialogState {
  open: boolean;
  rows: FileNode[];
  target: string;
}

export interface RenameDialogState {
  open: boolean;
  row: FileNode | null;
  value: string;
}

export interface DeleteDialogState {
  open: boolean;
  rows: FileNode[];
  confirmText: string;
}

export interface ShareDialogState {
  open: boolean;
  row: FileNode | null;
  url: string;
  loading: boolean;
  error: string;
}
