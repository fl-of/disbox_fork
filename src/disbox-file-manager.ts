import { sha256 } from 'js-sha256';
import {
  assertPassphrase,
  createEncryptionContext,
  decryptChunk,
  encryptChunk,
  keyFromMeta,
  parseStoredFileContent,
  serializeStoredFileContent,
  type EncryptionMeta,
} from './utils/crypto';

export type ProgressCallback = ((value: number, total: number) => void) | null | undefined;

export interface FileNode {
  id?: number | null;
  name: string;
  type: 'file' | 'directory';
  path?: string;
  size?: number;
  content?: string | null;
  created_at?: string;
  updated_at?: string;
  parent_id?: number | null;
  children?: Record<string, FileNode>;
  [key: string]: any;
}

interface WriteStreamLike {
  write: (data: Blob | BufferSource | string) => Promise<void> | void;
  close: () => Promise<void> | void;
}

const SERVER_URL = import.meta.env.VITE_DISBOX_SERVER_URL || 'https://disbox-server.fly.dev';
export const FILE_DELIMITER = '/';

// Discord's free upload limit is 10MB. Keep a safety margin below it.
const FILE_CHUNK_SIZE = 9 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;
const DOWNLOAD_CONCURRENCY = 3;
const API_CONCURRENCY = 4;
const DEFAULT_EXTENSION_ID = 'jklpfhklkhbfgeencifbmkoiaokeieah';
const CONFIGURED_EXTENSION_IDS = (
  import.meta.env.VITE_DISBOX_EXTENSION_IDS ||
  import.meta.env.VITE_DISBOX_EXTENSION_ID ||
  ''
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const EXTENSION_IDS = Array.from(new Set([...CONFIGURED_EXTENSION_IDS, DEFAULT_EXTENSION_ID]));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `worker` over `items` with at most `limit` concurrent invocations.
 * Results keep the same order as the input array.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown = null;

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      while (!firstError) {
        const index = nextIndex++;
        if (index >= items.length) {
          return;
        }
        try {
          results[index] = await worker(items[index], index);
        } catch (error) {
          if (!firstError) {
            firstError = error;
          }
          return;
        }
      }
    },
  );

  await Promise.all(runners);
  if (firstError) {
    throw firstError;
  }
  return results;
}

// (readFile generator removed; uploads slice chunks by index to support pause/resume)

function getExtensionRuntime(): any | null {
  const c: any = (globalThis as any).chrome;
  if (c?.runtime?.sendMessage) return c.runtime;
  const b: any = (globalThis as any).browser;
  if (b?.runtime?.sendMessage) return b.runtime;
  return null;
}

async function sendMessageToExtension(
  runtime: any,
  extensionId: string,
  payload: any,
): Promise<any> {
  // Try callback style first (Chrome/page compatibility), then Promise style.
  try {
    const callbackResult = await new Promise<any>((resolve) => {
      let settled = false;
      try {
        runtime.sendMessage(extensionId, payload, (response: any) => {
          if (settled) return;
          settled = true;
          try {
            const c: any = (globalThis as any).chrome;
            void c?.runtime?.lastError;
          } catch {
            // ignore
          }
          resolve(response);
        });
        // Some implementations return a Promise and ignore callback; handle below via timeout fallback.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(undefined);
          }
        }, 1500);
      } catch {
        if (!settled) resolve(undefined);
      }
    });
    if (callbackResult !== undefined) return callbackResult;
  } catch {
    // fall through
  }

  try {
    return await runtime.sendMessage(extensionId, payload);
  } catch {
    return undefined;
  }
}

async function sendToExtension(payload: any, timeoutMs = 30000): Promise<any | null> {
  // Preferred path for Firefox/local extension: content-script bridge via window.postMessage.
  if (typeof window !== 'undefined') {
    const bridged = await new Promise<any | null>((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timeout);
      };
      const finish = (value: any | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data: any = event.data;
        if (!data || data.source !== 'disbox-extension' || data.type !== 'DISBOX_FETCH_RESPONSE')
          return;
        if (data.requestId !== requestId) return;
        finish(data.response ?? null);
      };
      const timeout = setTimeout(() => finish(null), timeoutMs);
      window.addEventListener('message', onMessage);
      window.postMessage(
        { source: 'disbox-page', type: 'DISBOX_FETCH', requestId, message: payload },
        '*',
      );
    });
    if (bridged) return bridged;
  }

  const runtime = getExtensionRuntime();
  if (!runtime) return null;

  for (const extensionId of EXTENSION_IDS) {
    try {
      const response = await sendMessageToExtension(runtime, extensionId, { message: payload });
      if (response) return response;
    } catch {
      // try next extension id
    }
  }
  return null;
}

export async function detectExtensionDownloadSupport(): Promise<{
  available: boolean;
  canDirectDownload: boolean;
}> {
  const response = await sendToExtension({}, 2000);
  if (!response || !response.installed) {
    return { available: false, canDirectDownload: false };
  }
  const caps = Array.isArray(response.capabilities) ? response.capabilities : [];
  return { available: true, canDirectDownload: caps.includes('download') };
}

async function fetchUrlFromExtension(url: string): Promise<string | null> {
  const response = await sendToExtension({ url });
  if (response && response.data) {
    return response.data as string;
  }
  return null;
}

async function downloadViaExtension(filename: string, urls: string[]): Promise<boolean> {
  const response = await sendToExtension(
    { action: 'download', filename, urls },
    Math.max(30000, urls.length * 30000),
  );
  return Boolean(response && (response.ok || response.downloadId));
}

const CONFIGURED_DOWNLOAD_PROXY = (import.meta.env.VITE_DOWNLOAD_PROXY_URL || '').trim();

function buildConfiguredProxyUrl(targetUrl: string): string | null {
  if (!CONFIGURED_DOWNLOAD_PROXY) return null;
  if (CONFIGURED_DOWNLOAD_PROXY.includes('{url}')) {
    return CONFIGURED_DOWNLOAD_PROXY.replace('{url}', encodeURIComponent(targetUrl));
  }
  // If the configured value already has a query parameter, append encoded URL; otherwise treat as prefix.
  if (/[?&]$/.test(CONFIGURED_DOWNLOAD_PROXY) || /[?&][^=]+=$/.test(CONFIGURED_DOWNLOAD_PROXY)) {
    return `${CONFIGURED_DOWNLOAD_PROXY}${encodeURIComponent(targetUrl)}`;
  }
  if (CONFIGURED_DOWNLOAD_PROXY.endsWith('/')) {
    return `${CONFIGURED_DOWNLOAD_PROXY}${targetUrl}`;
  }
  return `${CONFIGURED_DOWNLOAD_PROXY}${encodeURIComponent(targetUrl)}`;
}

const PROXY_BUILDERS: Array<(url: string) => string | null> = [
  buildConfiguredProxyUrl,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://cors.eu.org/${url}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || 'unknown error');
}

function isRetryableDownloadError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('networkerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('http 429') ||
    msg.includes('http 5')
  );
}

function isExpiredOrMissingError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    msg.includes('http 401') ||
    msg.includes('http 403') ||
    msg.includes('http 404') ||
    msg.includes('http 410')
  );
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  // Empty chunk may be valid for empty files, but usually indicates a bad proxy response.
  if (blob.size === 0) {
    throw new Error('Empty response');
  }
  return blob;
}

async function fetchUrlWithRetry(url: string, retries = 2): Promise<Blob> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchUrl(url);
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableDownloadError(error)) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function fetchUrl(url: string): Promise<Blob> {
  const errors: string[] = [];

  const extensionUrl = await fetchUrlFromExtension(url);
  if (extensionUrl) {
    try {
      return await fetchBlob(extensionUrl);
    } catch (error) {
      errors.push(`extension: ${getErrorMessage(error)}`);
    }
  }

  try {
    return await fetchBlob(url);
  } catch (error) {
    errors.push(`direct: ${getErrorMessage(error)}`);
  }

  for (const [index, buildProxyUrl] of PROXY_BUILDERS.entries()) {
    const proxyUrl = buildProxyUrl(url);
    if (!proxyUrl) {
      continue;
    }
    try {
      return await fetchBlob(proxyUrl);
    } catch (error) {
      errors.push(`proxy${index + 1}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error(`Unable to download data. ${errors.join(' | ')}`);
}

export async function downloadFromAttachmentUrls(
  attachmentUrls: string[],
  writeStream: WriteStreamLike,
  onProgress: ProgressCallback = null,
  fileSize: number | string = -1,
  decryption?: { key: CryptoKey; meta: EncryptionMeta } | null,
): Promise<void> {
  const total = Array.isArray(attachmentUrls) ? attachmentUrls.length : 0;
  let bytesDownloaded = 0;
  const expectedSize = typeof fileSize === 'string' ? Number(fileSize) : fileSize;

  if (onProgress) {
    onProgress(0, expectedSize);
  }

  if (total === 0) {
    await writeStream.write(new Blob([]));
    await writeStream.close();
    if (onProgress) {
      onProgress(1, 1);
    }
    return;
  }

  const blobs = new Array<Blob | null>(total).fill(null);
  let nextToFetch = 0;
  let nextToWrite = 0;
  let fetchError: unknown = null;
  let waitResolve: (() => void) | null = null;

  const notifyWriter = () => {
    if (waitResolve) {
      const resolve = waitResolve;
      waitResolve = null;
      resolve();
    }
  };

  const waitForData = () =>
    new Promise<void>((resolve) => {
      waitResolve = resolve;
    });

  const fetchWorker = async () => {
    while (!fetchError) {
      const index = nextToFetch++;
      if (index >= total) {
        return;
      }
      try {
        let blob = await fetchUrlWithRetry(attachmentUrls[index], 2);
        if (decryption) {
          const cipherBuf = await blob.arrayBuffer();
          const plainBuf = await decryptChunk(decryption.key, decryption.meta, index, cipherBuf);
          blob = new Blob([plainBuf]);
        }
        blobs[index] = blob;
        bytesDownloaded += blob.size;
        if (onProgress) {
          // For encrypted files, report plaintext bytes progress against expected plaintext size when provided.
          onProgress(bytesDownloaded, expectedSize);
        }
        notifyWriter();
      } catch (error) {
        fetchError = error;
        notifyWriter();
        return;
      }
    }
  };

  const writer = async () => {
    while (nextToWrite < total) {
      const blob = blobs[nextToWrite];
      if (blob) {
        blobs[nextToWrite] = null;
        await writeStream.write(blob);
        nextToWrite++;
      } else if (fetchError) {
        throw fetchError;
      } else {
        await waitForData();
      }
    }
  };

  try {
    await Promise.all([
      writer(),
      ...Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, () => fetchWorker()),
    ]);
    await writeStream.close();
    if (onProgress) {
      onProgress(1, 1);
    }
  } catch (error) {
    try {
      await writeStream.close();
    } catch {
      // ignore
    }
    throw error;
  }
}

class DiscordWebhookClient {
  id: string;
  token: string;
  baseUrl: string;
  rateLimitWaits: Record<string, number>;
  retryCounts: Record<string, number>;

  constructor(webhookUrl: string) {
    let url: URL;
    try {
      url = new URL(webhookUrl);
    } catch {
      throw new Error('Invalid Discord webhook URL.');
    }

    const match = url.pathname.match(/\/api\/webhooks\/(\d+)\/([^/]+)\/?$/);
    if (!match) {
      throw new Error('That does not look like a Discord webhook URL.');
    }

    this.id = match[1];
    this.token = match[2];
    this.baseUrl = `https://discord.com/api/webhooks/${this.id}/${this.token}`;
    this.rateLimitWaits = {};
    this.retryCounts = {};
  }

  async fetchFromApi(
    path: string,
    { type, method, body }: { type: string; method: string; body?: BodyInit | null },
  ): Promise<Response> {
    const wait = this.rateLimitWaits[type] || 0;
    if (wait > 0) {
      console.log(`Waiting ${Math.ceil(wait)}ms for rate limit to reset`);
      await sleep(wait);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      body: body ?? undefined,
    });

    const remainingRequests = Number(response.headers.get('X-RateLimit-Remaining'));
    const resetAfter = Number(response.headers.get('X-RateLimit-Reset-After'));
    if (
      Number.isFinite(remainingRequests) &&
      remainingRequests <= 0 &&
      Number.isFinite(resetAfter) &&
      resetAfter > 0
    ) {
      this.rateLimitWaits[type] = Math.max(resetAfter * 1000, 250);
    } else {
      this.rateLimitWaits[type] = 0;
    }

    if (response.status === 429) {
      let retryAfter = 1;
      try {
        const bodyJson = (await response.json()) as any;
        retryAfter = Number(bodyJson.retry_after) || 1;
      } catch {
        // Use the default retry delay.
      }

      const waitMs = Math.max(Math.ceil(retryAfter * 1000), 250);
      this.rateLimitWaits[type] = waitMs;
      this.retryCounts[type] = (this.retryCounts[type] || 0) + 1;

      if (this.retryCounts[type] > 5) {
        this.retryCounts[type] = 0;
        throw new Error(
          'Discord is rate limiting this webhook. Please wait a moment and try again.',
        );
      }

      console.log(`Rate limit exceeded, retrying in ${waitMs}ms`);
      return await this.fetchFromApi(path, { method, body, type });
    }

    this.retryCounts[type] = 0;
    if (!response.ok) {
      throw new Error(`Discord API error (${response.status}) while trying to ${type}.`);
    }
    return response;
  }

  async sendAttachment(filename: string, blob: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify({}));
    formData.append('file', blob, filename);
    const response = await this.fetchFromApi('?wait=true', {
      type: 'sendAttachment',
      method: 'POST',
      body: formData,
    });
    return await response.json();
  }

  async getMessage(id: string | number): Promise<any> {
    const response = await this.fetchFromApi(`/messages/${id}`, {
      type: 'getMessage',
      method: 'GET',
    });
    return await response.json();
  }

  async deleteMessage(id: string | number): Promise<void> {
    await this.fetchFromApi(`/messages/${id}`, {
      type: 'deleteMessage',
      method: 'DELETE',
    });
  }
}

class DiscordFileStorage {
  webhookClient: DiscordWebhookClient;

  constructor(webhookUrl: string) {
    this.webhookClient = new DiscordWebhookClient(webhookUrl);
  }

  async getAttachmentUrls(messageIds: Array<string | number>): Promise<string[]> {
    return await mapWithConcurrency(messageIds, API_CONCURRENCY, async (id) => {
      const message = await this.webhookClient.getMessage(id);
      if (!message.attachments || message.attachments.length === 0) {
        throw new Error(`Discord message ${id} has no attachment.`);
      }
      return message.attachments[0].url as string;
    });
  }

  async upload(
    sourceFile: Blob,
    namePrefix: string | number | undefined,
    onProgress: ProgressCallback = null,
    encryption?: { key: CryptoKey; meta: EncryptionMeta } | null,
    options?: {
      resume?: { messageIds?: Array<string | undefined>; uploadedBytes?: number };
      shouldPause?: () => boolean;
    },
  ): Promise<{ messageIds: string[]; paused: boolean; uploadedBytes: number }> {
    const totalChunks = Math.max(1, Math.ceil(sourceFile.size / FILE_CHUNK_SIZE));
    const messageIds: Array<string | undefined> = Array.from(
      { length: totalChunks },
      (_, i) => options?.resume?.messageIds?.[i],
    );
    let uploadedBytes = options?.resume?.uploadedBytes ?? 0;
    if (uploadedBytes === 0) {
      for (let i = 0; i < totalChunks; i++) {
        if (messageIds[i]) {
          const start = i * FILE_CHUNK_SIZE;
          const end = Math.min(sourceFile.size, start + FILE_CHUNK_SIZE);
          uploadedBytes += Math.max(0, end - start);
        }
      }
    }

    if (onProgress) {
      onProgress(uploadedBytes, sourceFile.size);
    }

    let nextIndex = 0;
    let failure: unknown = null;
    let paused = false;

    const worker = async () => {
      while (!failure) {
        if (options?.shouldPause?.()) {
          paused = true;
          return;
        }
        const index = nextIndex++;
        if (index >= totalChunks) {
          return;
        }
        if (messageIds[index]) {
          continue;
        }
        if (options?.shouldPause?.()) {
          paused = true;
          return;
        }

        try {
          const start = index * FILE_CHUNK_SIZE;
          const end = Math.min(sourceFile.size, start + FILE_CHUNK_SIZE);
          const plain = await sourceFile.slice(start, end).arrayBuffer();
          const data = encryption
            ? await encryptChunk(encryption.key, encryption.meta, index, plain)
            : plain;
          const result = await this.webhookClient.sendAttachment(
            `${namePrefix}_${index}`,
            new Blob([data]),
          );
          messageIds[index] = result.id;
          uploadedBytes += plain.byteLength;
          if (onProgress) {
            onProgress(uploadedBytes, sourceFile.size);
          }
        } catch (error) {
          failure = error;
          throw error;
        }
      }
    };

    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => worker()));
    if (failure) {
      throw failure;
    }

    const allDone = messageIds.every(Boolean);
    if (allDone && onProgress) {
      onProgress(sourceFile.size, sourceFile.size);
    }
    return { messageIds: messageIds as string[], paused: !allDone && paused, uploadedBytes };
  }

  async download(
    messageIds: Array<string | number>,
    writeStream: WriteStreamLike,
    onProgress: ProgressCallback = null,
    fileSize = -1,
    decryption?: { key: CryptoKey; meta: EncryptionMeta } | null,
  ): Promise<void> {
    let attachmentUrls = await this.getAttachmentUrls(messageIds);
    try {
      await downloadFromAttachmentUrls(
        attachmentUrls,
        writeStream,
        onProgress,
        fileSize,
        decryption,
      );
    } catch (error) {
      // Retry once with freshly fetched attachment URLs in case links expired.
      if (isExpiredOrMissingError(error)) {
        attachmentUrls = await this.getAttachmentUrls(messageIds);
        await downloadFromAttachmentUrls(
          attachmentUrls,
          writeStream,
          onProgress,
          fileSize,
          decryption,
        );
        return;
      }
      throw error;
    }
  }

  async downloadToExtension(
    messageIds: Array<string | number>,
    filename: string,
    isEncrypted = false,
  ): Promise<boolean> {
    if (isEncrypted) return false;
    let attachmentUrls = await this.getAttachmentUrls(messageIds);
    let ok = await downloadViaExtension(filename, attachmentUrls);
    if (ok) return true;
    // Retry once with fresh URLs if the extension path failed (possibly expired links).
    attachmentUrls = await this.getAttachmentUrls(messageIds);
    ok = await downloadViaExtension(filename, attachmentUrls);
    return ok;
  }

  async delete(messageIds: Array<string | number>, onProgress?: ProgressCallback): Promise<void> {
    let chunksDeleted = 0;
    if (onProgress) {
      onProgress(0, messageIds.length);
    }

    await mapWithConcurrency(messageIds, API_CONCURRENCY, async (id) => {
      await this.webhookClient.deleteMessage(id);
      chunksDeleted++;
      if (onProgress) {
        onProgress(chunksDeleted, messageIds.length);
      }
    });
  }
}

function countChildren(node: FileNode | null | undefined): number {
  if (!node || !node.children) {
    return 0;
  }
  return Object.keys(node.children).length;
}

function parseContentReferences(file: FileNode | null | undefined): {
  ids: string[];
  enc?: EncryptionMeta;
} {
  return parseStoredFileContent(file?.content);
}

class DisboxFileManager {
  userId: string;
  discordFileStorage: DiscordFileStorage;
  fileTree: FileNode;

  static async create(webhookUrl: string): Promise<DisboxFileManager> {
    let url: URL;
    try {
      url = new URL(webhookUrl);
    } catch {
      throw new Error('Invalid webhook URL.');
    }

    if (!/\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)) {
      throw new Error('That does not look like a Discord webhook URL.');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');

    const fileTrees: Record<string, FileNode> = {};
    for (const hostname of ['discord.com', 'discordapp.com']) {
      url.hostname = hostname;
      try {
        const result = await fetch(`${SERVER_URL}/files/get/${sha256(url.href)}`);
        if (result.ok) {
          fileTrees[url.href] = (await result.json()) as FileNode;
        }
      } catch {
        // Try the next hostname.
      }
    }

    const entries = Object.entries(fileTrees);
    if (entries.length === 0) {
      throw new Error('Could not reach the Disbox server. Check your connection and try again.');
    }

    entries.sort((a, b) => countChildren(b[1]) - countChildren(a[1]));
    const [chosenUrl, fileTree] = entries[0];
    if (!fileTree || typeof fileTree !== 'object') {
      throw new Error('The server returned an invalid file tree.');
    }

    return new this(sha256(chosenUrl), new DiscordFileStorage(webhookUrl), fileTree);
  }

  constructor(userId: string, storage: DiscordFileStorage, fileTree: FileNode) {
    this.userId = userId;
    this.discordFileStorage = storage;
    this.fileTree = fileTree;
  }

  getFile(path: string | null | undefined, copy = true): FileNode | null {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    let file: FileNode | undefined = this.fileTree;
    const pathParts = normalized ? normalized.split(FILE_DELIMITER) : [];

    for (const part of pathParts) {
      if (!file || !file.children || !file.children[part]) {
        return null;
      }
      file = file.children[part];
    }

    if (!file) return null;
    if (copy) {
      return { ...file, path: path || '' };
    }
    return file;
  }

  getChildren(path: string): Record<string, FileNode> {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    let node: FileNode | null | undefined = this.fileTree;

    if (normalized) {
      node = this.getFile(path, false);
      if (!node) {
        throw new Error(`File not found: ${path}`);
      }
      if (node.type !== 'directory') {
        throw new Error(`File is not a directory: ${path}`);
      }
    }

    const children = node?.children || {};
    const parsedChildren: Record<string, FileNode> = {};
    for (const [name, child] of Object.entries(children)) {
      parsedChildren[name] = {
        ...child,
        path: `${normalized}${FILE_DELIMITER}${name}`,
      };
    }
    return parsedChildren;
  }

  getParent(path: string): FileNode | null {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      return null;
    }

    const parts = normalized.split(FILE_DELIMITER);
    if (parts.length === 1) {
      return this.fileTree;
    }
    return this.getFile(`/${parts.slice(0, -1).join(FILE_DELIMITER)}`, false);
  }

  async updateFile(
    path: string,
    changes: Partial<FileNode> & Record<string, any>,
  ): Promise<FileNode> {
    const file = this.getFile(path, false);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    if (!('updated_at' in changes)) {
      changes.updated_at = new Date().toISOString();
    }

    const result = await fetch(`${SERVER_URL}/files/update/${this.userId}/${file.id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(changes),
    });
    if (!result.ok) {
      throw new Error(`Error updating file: ${result.status} ${result.statusText}`);
    }

    Object.assign(file, changes);
    return file;
  }

  async renameFile(path: string, newName: string): Promise<FileNode | null> {
    const file = this.getFile(path, false);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    const oldName = file.name;
    const trimmedName = String(newName || '').trim();
    if (!trimmedName) {
      throw new Error('File name cannot be empty.');
    }
    if (trimmedName.includes(FILE_DELIMITER)) {
      throw new Error(`File name cannot contain "${FILE_DELIMITER}".`);
    }

    const newPath = `${path.slice(0, path.length - oldName.length)}${trimmedName}`;
    if (newPath === path) {
      return this.getFile(path);
    }
    if (this.getFile(newPath)) {
      throw new Error(`File already exists: ${newPath}`);
    }

    const parent = this.getParent(path);
    await this.updateFile(path, { name: trimmedName });

    if (parent && parent.children) {
      delete parent.children[oldName];
      parent.children[trimmedName] = file;
    }

    return this.getFile(newPath);
  }

  async moveFile(path: string, newParentPath: string): Promise<FileNode | null> {
    const file = this.getFile(path, false);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    const oldParent = this.getParent(path);
    const newParent = newParentPath === '' ? this.fileTree : this.getFile(newParentPath, false);
    if (!newParent) {
      throw new Error(`Parent directory not found: ${newParentPath}`);
    }
    if (newParent.type !== 'directory') {
      throw new Error(`Parent is not a directory: ${newParentPath}`);
    }

    const normalizedParent = String(newParentPath || '').replace(/\/+$/, '');
    const newPath = `${normalizedParent}/${file.name}`;
    if (this.getFile(newPath)) {
      throw new Error(`File already exists: ${newPath}`);
    }

    await this.updateFile(path, { parent_id: newParent.id });

    if (oldParent && oldParent.children) {
      delete oldParent.children[file.name];
    }
    if (!newParent.children) {
      newParent.children = {};
    }
    newParent.children[file.name] = file;
    return this.getFile(newPath);
  }

  async deleteFile(path: string, onProgress?: ProgressCallback): Promise<{ success: boolean }> {
    const file = this.getFile(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    const filesToDelete: Array<{
      path: string;
      name: string;
      id?: number | null;
      contentReferences: string[];
    }> = [];
    const directoriesToDelete: Array<{ path: string; name: string; id?: number | null }> = [];

    const collect = (nodePath: string, node: FileNode | null) => {
      if (!node) {
        return;
      }
      if (node.type === 'directory') {
        directoriesToDelete.push({ path: nodePath, name: node.name, id: node.id });
        for (const child of Object.values(this.getChildren(nodePath))) {
          collect(child.path as string, this.getFile(child.path as string, false));
        }
      } else {
        filesToDelete.push({
          path: nodePath,
          name: node.name,
          id: node.id,
          contentReferences: parseContentReferences(node).ids,
        });
      }
    };

    collect(path, file);

    const totalChunks = filesToDelete.reduce((sum, f) => sum + f.contentReferences.length, 0);
    let deletedChunks = 0;
    const reportProgress = () => {
      if (onProgress) {
        onProgress(deletedChunks, totalChunks);
      }
    };
    reportProgress();

    for (const fileToDelete of filesToDelete) {
      const result = await fetch(`${SERVER_URL}/files/delete/${this.userId}/${fileToDelete.id}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        throw new Error(`Error deleting file: ${result.status} ${result.statusText}`);
      }

      if (fileToDelete.contentReferences.length > 0) {
        await this.discordFileStorage.delete(fileToDelete.contentReferences);
        deletedChunks += fileToDelete.contentReferences.length;
      }

      const parent = this.getParent(fileToDelete.path);
      if (parent && parent.children) {
        delete parent.children[fileToDelete.name];
      }
      reportProgress();
    }

    directoriesToDelete.sort(
      (a, b) => b.path.split(FILE_DELIMITER).length - a.path.split(FILE_DELIMITER).length,
    );
    for (const directory of directoriesToDelete) {
      const result = await fetch(`${SERVER_URL}/files/delete/${this.userId}/${directory.id}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        throw new Error(`Error deleting directory: ${result.status} ${result.statusText}`);
      }

      const parent = this.getParent(directory.path);
      if (parent && parent.children) {
        delete parent.children[directory.name];
      }
    }

    if (onProgress) {
      onProgress(1, 1);
    }
    return { success: true };
  }

  async createDirectory(path: string): Promise<FileNode | null> {
    await this.createFile(path, 'directory');
    return this.getFile(path);
  }

  async createFile(path: string, type: 'file' | 'directory' = 'file'): Promise<FileNode | null> {
    if (this.getFile(path)) {
      throw new Error(`File already exists: ${path}`);
    }

    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    const name = normalized.split(FILE_DELIMITER).pop();
    if (!name) {
      throw new Error(`Invalid file path: ${path}`);
    }

    const parent = this.getParent(path);
    if (!parent) {
      throw new Error(`Parent directory not found: ${path}`);
    }

    const newFile: FileNode = {
      parent_id: parent.id === undefined ? null : (parent.id as number | null),
      name,
      type,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await fetch(`${SERVER_URL}/files/create/${this.userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newFile),
    });
    if (!result.ok) {
      throw new Error(`Error creating file: ${result.status} ${result.statusText}`);
    }

    const newFileId = Number(await result.text());
    if (!parent.children) {
      parent.children = {};
    }
    parent.children[name] = {
      ...newFile,
      ...(type === 'directory' ? { children: {} } : {}),
      id: newFileId,
    } as FileNode;
    return this.getFile(path);
  }

  async ensureDirectory(path: string): Promise<FileNode | null> {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
    if (!normalized) {
      return this.fileTree;
    }

    let current = '';
    for (const part of normalized.split(FILE_DELIMITER)) {
      current += `${FILE_DELIMITER}${part}`;
      const existing = this.getFile(current);
      if (!existing) {
        await this.createDirectory(current);
      } else if (existing.type !== 'directory') {
        throw new Error(`A file already exists at ${current}`);
      }
    }
    return this.getFile(path);
  }

  async uploadFile(
    path: string,
    fileBlob: Blob,
    onProgress?: ProgressCallback,
    options?: {
      encrypt?: boolean;
      passphrase?: string;
      resume?: {
        messageIds?: Array<string | undefined>;
        uploadedBytes?: number;
        enc?: EncryptionMeta;
      };
      shouldPause?: () => boolean;
    },
  ): Promise<
    | { status: 'completed'; file: FileNode | null }
    | {
        status: 'paused';
        resume: { messageIds: string[]; uploadedBytes: number; enc?: EncryptionMeta };
      }
  > {
    let file = this.getFile(path, false);
    if (!file) {
      await this.createFile(path);
      file = this.getFile(path, false);
    }
    if (!file || file.type === 'directory') {
      throw new Error(`Cannot upload content to a directory: ${path}`);
    }

    const oldRefs = parseContentReferences(file);
    let encryption: { key: CryptoKey; meta: EncryptionMeta } | null = null;
    if (options?.encrypt) {
      const passphrase = assertPassphrase(options.passphrase || '');
      if (options.resume?.enc) {
        encryption = {
          key: await keyFromMeta(passphrase, options.resume.enc),
          meta: options.resume.enc,
        };
      } else {
        const ctx = await createEncryptionContext(passphrase);
        ctx.meta.chunkSize = FILE_CHUNK_SIZE;
        encryption = { key: ctx.key, meta: ctx.meta };
      }
    } else if (options?.resume?.enc) {
      // Resume must keep same encryption metadata/key if upload was encrypted.
      const passphrase = assertPassphrase(options.passphrase || '');
      encryption = {
        key: await keyFromMeta(passphrase, options.resume.enc),
        meta: options.resume.enc,
      };
    }

    const result = await this.discordFileStorage.upload(
      fileBlob,
      file.id as any,
      onProgress,
      encryption,
      { resume: options?.resume, shouldPause: options?.shouldPause },
    );

    if (result.paused) {
      return {
        status: 'paused',
        resume: {
          messageIds: result.messageIds,
          uploadedBytes: result.uploadedBytes,
          enc: encryption?.meta,
        },
      };
    }

    if (oldRefs.ids.length > 0) {
      try {
        await this.discordFileStorage.delete(oldRefs.ids);
      } catch {
        // The old attachments are harmless orphans if this fails.
      }
    }

    await this.updateFile(path, {
      size: fileBlob.size,
      content: serializeStoredFileContent(result.messageIds, encryption?.meta),
    });

    if (onProgress) {
      onProgress(fileBlob.size, fileBlob.size);
    }
    return { status: 'completed', file: this.getFile(path) };
  }

  async downloadFile(
    path: string,
    writeStream: WriteStreamLike,
    onProgress?: ProgressCallback,
    options?: { passphrase?: string },
  ): Promise<void> {
    const file = this.getFile(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    if (file.type === 'directory') {
      throw new Error(`Cannot download content from directory: ${path}`);
    }

    const refs = parseContentReferences(file);
    let decryption: { key: CryptoKey; meta: EncryptionMeta } | null = null;
    if (refs.enc) {
      const passphrase = assertPassphrase(options?.passphrase || '');
      try {
        const key = await keyFromMeta(passphrase, refs.enc);
        decryption = { key, meta: refs.enc };
      } catch {
        throw new Error('Failed to initialize decryption. Check the encryption passphrase.');
      }
    }

    try {
      await this.discordFileStorage.download(
        refs.ids,
        writeStream,
        onProgress,
        file.size || -1,
        decryption,
      );
    } catch (error) {
      const msg = getErrorMessage(error);
      if (refs.enc && (msg.toLowerCase().includes('decrypt') || msg.includes('OperationError'))) {
        throw new Error(
          'Failed to decrypt file. The encryption passphrase may be incorrect or the file data is corrupted.',
        );
      }
      if (isExpiredOrMissingError(error)) {
        throw new Error(
          `Download failed because attachment links may have expired or are unavailable. ${msg}`,
        );
      }
      throw new Error(`Download failed: ${msg}`);
    }
  }

  async downloadFileViaExtension(path: string): Promise<boolean> {
    const file = this.getFile(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    if (file.type === 'directory') {
      throw new Error(`Cannot download content from directory: ${path}`);
    }
    const refs = parseContentReferences(file);
    if (refs.enc) return false;
    try {
      return await this.discordFileStorage.downloadToExtension(refs.ids, file.name, false);
    } catch {
      return false;
    }
  }

  isFileEncrypted(path: string): boolean {
    const file = this.getFile(path);
    if (!file || file.type === 'directory') return false;
    return Boolean(parseContentReferences(file).enc);
  }

  async getAttachmentUrls(path: string): Promise<string[]> {
    const file = this.getFile(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    if (file.type === 'directory') {
      throw new Error(`Cannot share directory: ${path}`);
    }

    const refs = parseContentReferences(file);
    return await this.discordFileStorage.getAttachmentUrls(refs.ids);
  }

  getFileEncryptionMeta(path: string): EncryptionMeta | null {
    const file = this.getFile(path);
    if (!file || file.type === 'directory') return null;
    return parseContentReferences(file).enc || null;
  }
}

export default DisboxFileManager;
