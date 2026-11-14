import { FILE_DELIMITER } from '../disbox-file-manager';
import { getMimeType } from '../file-utils';

export function normalizePath(p: string | null | undefined): string {
  return String(p || '').replace(/^\/+|\/+$/g, '');
}

export function joinPath(base: string | null | undefined, name: string): string {
  const b = normalizePath(base);
  return b ? `${FILE_DELIMITER}${b}${FILE_DELIMITER}${name}` : `${FILE_DELIMITER}${name}`;
}

export function canPreviewFile(name?: string, size?: number): boolean {
  if (!name) return false;
  if (size && size > 25 * 1024 * 1024) return false;
  const mime = getMimeType(name);
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json'
  );
}

export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
