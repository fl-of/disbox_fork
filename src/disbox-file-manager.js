/*global chrome*/
import { sha256 } from 'js-sha256';

const SERVER_URL = process.env.REACT_APP_DISBOX_SERVER_URL || 'https://disbox-server.fly.dev';
export const FILE_DELIMITER = '/';

// Discord's free upload limit is 10MB. Keep a safety margin below it.
const FILE_CHUNK_SIZE = 9 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;
const DOWNLOAD_CONCURRENCY = 3;
const API_CONCURRENCY = 4;
const EXTENSION_ID = 'jklpfhklkhbfgeencifbmkoiaokeieah';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `worker` over `items` with at most `limit` concurrent invocations.
 * Results keep the same order as the input array.
 */
async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    let firstError = null;

    const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
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
    });

    await Promise.all(runners);
    if (firstError) {
        throw firstError;
    }
    return results;
}

async function* readFile(file, chunkSize) {
    const fileSize = file.size;
    let offset = 0;

    while (offset < fileSize) {
        const blob = file.slice(offset, offset + chunkSize);
        yield await blob.arrayBuffer();
        offset += chunkSize;
    }
}

function hasExtensionApi() {
    return typeof chrome !== 'undefined'
        && chrome.runtime
        && typeof chrome.runtime.sendMessage === 'function';
}

async function fetchUrlFromExtension(url) {
    if (!hasExtensionApi()) {
        return null;
    }

    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(EXTENSION_ID, { message: { url } }, (response) => {
                // Reading lastError prevents an "Unchecked runtime.lastError" warning
                // when the extension is not installed.
                try {
                    void chrome.runtime.lastError;
                } catch {
                    // ignore
                }
                if (!response || !response.data) {
                    resolve(null);
                } else {
                    resolve(response.data);
                }
            });
        } catch {
            resolve(null);
        }
    });
}

const PROXY_BUILDERS = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
    (url) => `https://cors.eu.org/${url}`,
];

async function fetchBlob(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.blob();
}

async function fetchUrl(url) {
    // The extension is the recommended path: it avoids third-party proxies.
    const extensionUrl = await fetchUrlFromExtension(url);
    if (extensionUrl) {
        try {
            return await fetchBlob(extensionUrl);
        } catch {
            // Fall through to the other methods.
        }
    }

    // Discord's CDN does not normally send CORS headers, but try it first:
    // if it works it is the fastest option and avoids a proxy.
    try {
        return await fetchBlob(url);
    } catch {
        // Fall through to the proxies.
    }

    let lastError = null;
    for (const buildProxyUrl of PROXY_BUILDERS) {
        try {
            return await fetchBlob(buildProxyUrl(url));
        } catch (error) {
            lastError = error;
        }
    }

    throw new Error(`Unable to download data (${lastError ? lastError.message : 'network error'})`);
}

export async function downloadFromAttachmentUrls(attachmentUrls, writeStream, onProgress = null, fileSize = -1) {
    const total = Array.isArray(attachmentUrls) ? attachmentUrls.length : 0;
    let bytesDownloaded = 0;

    if (onProgress) {
        onProgress(0, fileSize);
    }

    if (total === 0) {
        await writeStream.write(new Blob([]));
        await writeStream.close();
        if (onProgress) {
            onProgress(1, 1);
        }
        return;
    }

    // Download a few chunks ahead while writing them in order, so the output
    // file is correct without keeping the whole file in memory.
    const blobs = new Array(total);
    let nextToFetch = 0;
    let nextToWrite = 0;
    let fetchError = null;
    let waitResolve = null;

    const notifyWriter = () => {
        if (waitResolve) {
            const resolve = waitResolve;
            waitResolve = null;
            resolve();
        }
    };

    const waitForData = () => new Promise((resolve) => {
        waitResolve = resolve;
    });

    const fetchWorker = async () => {
        while (!fetchError) {
            const index = nextToFetch++;
            if (index >= total) {
                return;
            }
            try {
                const blob = await fetchUrl(attachmentUrls[index]);
                blobs[index] = blob;
                bytesDownloaded += blob.size;
                if (onProgress) {
                    onProgress(bytesDownloaded, fileSize);
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
            if (blobs[nextToWrite]) {
                const blob = blobs[nextToWrite];
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
    constructor(webhookUrl) {
        let url;
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

    async fetchFromApi(path, { type, method, body }) {
        const wait = this.rateLimitWaits[type] || 0;
        if (wait > 0) {
            console.log(`Waiting ${Math.ceil(wait)}ms for rate limit to reset`);
            await sleep(wait);
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method: method,
            body: body,
        });

        const remainingRequests = Number(response.headers.get('X-RateLimit-Remaining'));
        const resetAfter = Number(response.headers.get('X-RateLimit-Reset-After'));
        if (Number.isFinite(remainingRequests) && remainingRequests <= 0
            && Number.isFinite(resetAfter) && resetAfter > 0) {
            this.rateLimitWaits[type] = Math.max(resetAfter * 1000, 250);
        } else {
            this.rateLimitWaits[type] = 0;
        }

        if (response.status === 429) {
            let retryAfter = 1;
            try {
                const body = await response.json();
                retryAfter = Number(body.retry_after) || 1;
            } catch {
                // Use the default retry delay.
            }

            const waitMs = Math.max(Math.ceil(retryAfter * 1000), 250);
            this.rateLimitWaits[type] = waitMs;
            this.retryCounts[type] = (this.retryCounts[type] || 0) + 1;

            if (this.retryCounts[type] > 5) {
                this.retryCounts[type] = 0;
                throw new Error('Discord is rate limiting this webhook. Please wait a moment and try again.');
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

    async sendAttachment(filename, blob) {
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

    async getMessage(id) {
        const response = await this.fetchFromApi(`/messages/${id}`, {
            type: 'getMessage',
            method: 'GET',
        });
        return await response.json();
    }

    async deleteMessage(id) {
        await this.fetchFromApi(`/messages/${id}`, {
            type: 'deleteMessage',
            method: 'DELETE',
        });
    }
}

class DiscordFileStorage {
    constructor(webhookUrl) {
        this.webhookClient = new DiscordWebhookClient(webhookUrl);
    }

    async getAttachmentUrls(messageIds) {
        return await mapWithConcurrency(messageIds, API_CONCURRENCY, async (id) => {
            const message = await this.webhookClient.getMessage(id);
            if (!message.attachments || message.attachments.length === 0) {
                throw new Error(`Discord message ${id} has no attachment.`);
            }
            return message.attachments[0].url;
        });
    }

    async upload(sourceFile, namePrefix, onProgress = null) {
        if (onProgress) {
            onProgress(0, sourceFile.size);
        }

        const messageIds = [];
        const iterator = readFile(sourceFile, FILE_CHUNK_SIZE);
        let nextIndex = 0;
        let uploadedBytes = 0;
        let failure = null;

        const worker = async () => {
            while (!failure) {
                // Reserve the chunk index before awaiting so chunks are uploaded
                // in the same order they are read, even with concurrency.
                const index = nextIndex++;
                const { value, done } = await iterator.next();
                if (done || failure) {
                    return;
                }

                try {
                    const result = await this.webhookClient.sendAttachment(
                        `${namePrefix}_${index}`,
                        new Blob([value])
                    );
                    messageIds[index] = result.id;
                    uploadedBytes += value.byteLength;
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

        if (onProgress) {
            onProgress(sourceFile.size, sourceFile.size);
        }
        return messageIds;
    }

    async download(messageIds, writeStream, onProgress = null, fileSize = -1) {
        const attachmentUrls = await this.getAttachmentUrls(messageIds);
        await downloadFromAttachmentUrls(attachmentUrls, writeStream, onProgress, fileSize);
    }

    async delete(messageIds, onProgress) {
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

function countChildren(node) {
    if (!node || !node.children) {
        return 0;
    }
    return Object.keys(node.children).length;
}

function parseContentReferences(file) {
    if (!file || !file.content) {
        return [];
    }
    try {
        const parsed = JSON.parse(file.content);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

class DisboxFileManager {
    static async create(webhookUrl) {
        let url;
        try {
            url = new URL(webhookUrl);
        } catch {
            throw new Error('Invalid webhook URL.');
        }

        if (!/\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)) {
            throw new Error('That does not look like a Discord webhook URL.');
        }
        url.pathname = url.pathname.replace(/\/+$/, '');

        const fileTrees = {};
        for (const hostname of ['discord.com', 'discordapp.com']) {
            url.hostname = hostname;
            try {
                const result = await fetch(`${SERVER_URL}/files/get/${sha256(url.href)}`);
                if (result.ok) {
                    fileTrees[url.href] = await result.json();
                }
            } catch {
                // Try the next hostname.
            }
        }

        const entries = Object.entries(fileTrees);
        if (entries.length === 0) {
            throw new Error('Could not reach the Disbox server. Check your connection and try again.');
        }

        // If one of the hostnames has data, prefer it regardless of what was entered.
        entries.sort((a, b) => countChildren(b[1]) - countChildren(a[1]));
        const [chosenUrl, fileTree] = entries[0];
        if (!fileTree || typeof fileTree !== 'object') {
            throw new Error('The server returned an invalid file tree.');
        }

        return new this(sha256(chosenUrl), new DiscordFileStorage(webhookUrl), fileTree);
    }

    constructor(userId, storage, fileTree) {
        this.userId = userId;
        this.discordFileStorage = storage;
        this.fileTree = fileTree;
    }

    getFile(path, copy = true) {
        const normalized = (path || '').replace(/^\/+|\/+$/g, '');
        let file = this.fileTree;
        const pathParts = normalized ? normalized.split(FILE_DELIMITER) : [];

        for (const part of pathParts) {
            if (!file || !file.children || !file.children[part]) {
                return null;
            }
            file = file.children[part];
        }

        if (copy) {
            return { ...file, path: path || '' };
        }
        return file;
    }

    getChildren(path) {
        const normalized = (path || '').replace(/^\/+|\/+$/g, '');
        let node = this.fileTree;

        if (normalized) {
            node = this.getFile(path, false);
            if (!node) {
                throw new Error(`File not found: ${path}`);
            }
            if (node.type !== 'directory') {
                throw new Error(`File is not a directory: ${path}`);
            }
        }

        const children = node.children || {};
        const parsedChildren = {};
        for (const [name, child] of Object.entries(children)) {
            parsedChildren[name] = {
                ...child,
                path: `${normalized}${FILE_DELIMITER}${name}`,
            };
        }
        return parsedChildren;
    }

    getParent(path) {
        const normalized = (path || '').replace(/^\/+|\/+$/g, '');
        if (!normalized) {
            return null;
        }

        const parts = normalized.split(FILE_DELIMITER);
        if (parts.length === 1) {
            return this.fileTree;
        }
        return this.getFile(`/${parts.slice(0, -1).join(FILE_DELIMITER)}`, false);
    }

    async updateFile(path, changes) {
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

    async renameFile(path, newName) {
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

    async moveFile(path, newParentPath) {
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

        const normalizedParent = (newParentPath || '').replace(/\/+$/, '');
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

    async deleteFile(path, onProgress) {
        const file = this.getFile(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }

        const filesToDelete = [];
        const directoriesToDelete = [];

        const collect = (nodePath, node) => {
            if (!node) {
                return;
            }
            if (node.type === 'directory') {
                directoriesToDelete.push({ path: nodePath, name: node.name, id: node.id });
                for (const child of Object.values(this.getChildren(nodePath))) {
                    collect(child.path, this.getFile(child.path, false));
                }
            } else {
                filesToDelete.push({
                    path: nodePath,
                    name: node.name,
                    id: node.id,
                    contentReferences: parseContentReferences(node),
                });
            }
        };

        collect(path, file);

        let totalChunks = filesToDelete.reduce((sum, f) => sum + f.contentReferences.length, 0);
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

        // Delete deepest directories first.
        directoriesToDelete.sort((a, b) => b.path.split(FILE_DELIMITER).length - a.path.split(FILE_DELIMITER).length);
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

    async createDirectory(path) {
        await this.createFile(path, 'directory');
        return this.getFile(path);
    }

    async createFile(path, type = 'file') {
        if (this.getFile(path)) {
            throw new Error(`File already exists: ${path}`);
        }

        const normalized = (path || '').replace(/^\/+|\/+$/g, '');
        const name = normalized.split(FILE_DELIMITER).pop();
        if (!name) {
            throw new Error(`Invalid file path: ${path}`);
        }

        const parent = this.getParent(path);
        if (!parent) {
            throw new Error(`Parent directory not found: ${path}`);
        }

        const newFile = {
            parent_id: parent.id === undefined ? null : parent.id,
            name: name,
            type: type,
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
        };
        return this.getFile(path);
    }

    async ensureDirectory(path) {
        const normalized = (path || '').replace(/^\/+|\/+$/g, '');
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

    async uploadFile(path, fileBlob, onProgress) {
        let file = this.getFile(path, false);
        if (!file) {
            await this.createFile(path);
            file = this.getFile(path, false);
        }
        if (!file || file.type === 'directory') {
            throw new Error(`Cannot upload content to a directory: ${path}`);
        }

        const oldContentReferences = parseContentReferences(file);
        const contentReferences = await this.discordFileStorage.upload(fileBlob, file.id, onProgress);

        // Remove the previous attachments after a successful re-upload.
        if (oldContentReferences.length > 0) {
            try {
                await this.discordFileStorage.delete(oldContentReferences);
            } catch {
                // The old attachments are harmless orphans if this fails.
            }
        }

        await this.updateFile(path, {
            size: fileBlob.size,
            content: JSON.stringify(contentReferences),
        });

        if (onProgress) {
            onProgress(fileBlob.size, fileBlob.size);
        }
        return this.getFile(path);
    }

    async downloadFile(path, writeStream, onProgress) {
        const file = this.getFile(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        if (file.type === 'directory') {
            throw new Error(`Cannot download content from directory: ${path}`);
        }

        await this.discordFileStorage.download(
            parseContentReferences(file),
            writeStream,
            onProgress,
            file.size
        );
    }

    async getAttachmentUrls(path) {
        const file = this.getFile(path);
        if (!file) {
            throw new Error(`File not found: ${path}`);
        }
        if (file.type === 'directory') {
            throw new Error(`Cannot share directory: ${path}`);
        }

        return await this.discordFileStorage.getAttachmentUrls(parseContentReferences(file));
    }
}

export default DisboxFileManager;