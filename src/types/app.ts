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
