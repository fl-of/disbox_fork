import * as mime from 'react-native-mime-types';
import { showSaveFilePicker } from 'native-file-system-adapter';
import pako from 'pako';
import { FILE_DELIMITER } from './disbox-file-manager';

export interface DroppedFileEntry {
  file: File;
  path: string;
}

export function getMimeType(name: string): string {
  return (mime.lookup(name) as string) || 'application/octet-stream';
}

export async function pickLocationAsWritable(suggestedName: string): Promise<any> {
  const pickerConfig: any = {
    suggestedName,
  };

  if (suggestedName.includes('.')) {
    const extension = `.${suggestedName.split('.').pop()}`;
    const mimeType = getMimeType(suggestedName);
    pickerConfig.types = [{
      description: extension,
      accept: { [mimeType]: [extension] },
    }];
  }

  const fileHandler = await showSaveFilePicker(pickerConfig);
  return await (await fileHandler.createWritable()).getWriter();
}

export function formatSize(bytes?: number | string | null, decimals = 1): string {
  const value = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (value === 0) return '0 Bytes';
  if (!value || Number.isNaN(value)) return '';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(value) / Math.log(k));

  return `${parseFloat((value / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function splitFileName(originalName: string): { baseName: string; extension: string } {
  const name = originalName || '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return { baseName: name, extension: '' };
  }
  return {
    baseName: name.substring(0, dot),
    extension: name.substring(dot + 1),
  };
}

export async function getAvailableFileName(fileManager: any, path: string, originalName: string): Promise<string> {
  const { baseName, extension } = splitFileName(originalName);
  const suffix = extension ? `.${extension}` : '';
  let name = baseName;
  let tryIndex = 1;

  while (fileManager.getFile(`${path}${FILE_DELIMITER}${name}${suffix}`)) {
    name = `${baseName} (${tryIndex})`;
    tryIndex++;
  }
  return `${name}${suffix}`;
}

/**
 * Expands a drag-and-drop DataTransfer into { file, path } entries, including
 * files nested inside dropped folders.
 */
export async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<DroppedFileEntry[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries = items
    .map((item: any) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []).map((file: File) => ({
      file,
      path: (file as any).webkitRelativePath || file.name,
    }));
  }

  const readAllEntries = (reader: any): Promise<any[]> => new Promise((resolve, reject) => {
    const all: any[] = [];
    const readBatch = () => {
      reader.readEntries((batch: any[]) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });

  const results: DroppedFileEntry[] = [];
  const walk = async (entry: any, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject));
      results.push({ file, path: `${prefix}${entry.name}` });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await readAllEntries(reader);
      for (const child of children) {
        await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };

  for (const entry of entries) {
    await walk(entry, '');
  }
  return results;
}

export function encodeShareAttachmentUrls(attachmentUrls: string[]): string {
  const bytes = pako.deflate(JSON.stringify(attachmentUrls));
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary)
    .replace(/\+/g, '~')
    .replace(/\//g, '_')
    .replace(/=/g, '-');
}
