import * as mime from 'react-native-mime-types';
import { showSaveFilePicker } from "native-file-system-adapter";
import pako from 'pako';
import { FILE_DELIMITER } from "./disbox-file-manager";

export function getMimeType(name) {
    return mime.lookup(name) || 'application/octet-stream';
}

export async function pickLocationAsWritable(suggestedName) {
    const pickerConfig = {
        suggestedName: suggestedName,
    };
    if (suggestedName.includes(".")) {
        const extension = `.${suggestedName.split(".").pop()}`;
        const mimeType = getMimeType(suggestedName);
        pickerConfig.types = [{
            description: extension,
            accept: { [mimeType]: [extension] },
        }];
    }
    const fileHandler = await showSaveFilePicker(pickerConfig);
    return await (await fileHandler.createWritable()).getWriter();
}

export function formatSize(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    if (!bytes) return '';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function splitFileName(originalName) {
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

export async function getAvailableFileName(fileManager, path, originalName) {
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
export async function getFilesFromDataTransfer(dataTransfer) {
    const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const entries = items
        .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
        .filter(Boolean);

    if (entries.length === 0) {
        return Array.from(dataTransfer.files || []).map((file) => ({
            file,
            path: file.webkitRelativePath || file.name,
        }));
    }

    const readAllEntries = (reader) => new Promise((resolve, reject) => {
        const all = [];
        const readBatch = () => {
            reader.readEntries((batch) => {
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

    const results = [];
    const walk = async (entry, prefix) => {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
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

export function encodeShareAttachmentUrls(attachmentUrls) {
    const bytes = pako.deflate(JSON.stringify(attachmentUrls));
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary)
        .replace(/\+/g, '~')
        .replace(/\//g, '_')
        .replace(/=/g, '-');
}