const runtimeApi = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
const downloadsApi = typeof browser !== 'undefined' ? browser.downloads : chrome.downloads;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read downloaded data'));
    reader.readAsDataURL(blob);
  });
}

async function fetchBlob(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.blob();
}

async function fetchAsDataUrl(url) {
  const blob = await fetchBlob(url);
  return await blobToDataUrl(blob);
}

function downloadBlob(filename, blob) {
  return new Promise((resolve, reject) => {
    try {
      const objectUrl = URL.createObjectURL(blob);
      downloadsApi.download({ url: objectUrl, filename, saveAs: true }, (downloadId) => {
        // Revoke later to allow the browser to read the blob URL.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        const err =
          typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError
            ? chrome.runtime.lastError
            : null;
        if (err) {
          reject(new Error(err.message || 'Download failed'));
          return;
        }
        resolve({ downloadId });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function sendProgress(sender, requestId, progress) {
  if (!requestId) return;
  try {
    if (
      sender &&
      sender.tab &&
      typeof sender.tab.id === 'number' &&
      runtimeApi?.tabs?.sendMessage
    ) {
      runtimeApi.tabs.sendMessage(sender.tab.id, {
        type: 'DISBOX_FETCH_PROGRESS',
        requestId,
        progress,
      });
      return;
    }
  } catch {
    // ignore
  }
  try {
    if (runtimeApi?.sendMessage) {
      runtimeApi.sendMessage({ type: 'DISBOX_FETCH_PROGRESS', requestId, progress });
    }
  } catch {
    // ignore
  }
}

async function downloadUrlsAsFile(filename, urls, options = {}) {
  const { sender = null, requestId = null, totalBytes = 0 } = options || {};
  const chunks = new Array(urls.length);
  let bytesDownloaded = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const blob = await fetchBlob(url);
        chunks[i] = blob;
        bytesDownloaded += blob.size || 0;
        lastError = null;
        await sendProgress(sender, requestId, {
          bytesDownloaded,
          totalBytes: totalBytes || undefined,
          chunksCompleted: i + 1,
          totalChunks: urls.length,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      throw lastError;
    }
  }

  const blob = new Blob(chunks);
  await downloadBlob(filename || 'download', blob);
  return { ok: true, chunks: chunks.length, bytesDownloaded };
}

async function handleMessage(message, sender) {
  const payload = message && message.message ? message.message : message;
  const requestId = message && message.requestId ? message.requestId : null;

  // Install/ping request.
  if (!payload || (!payload.url && !payload.action)) {
    return { installed: true, capabilities: ['fetch', 'download'] };
  }

  try {
    if (payload.action === 'download' && Array.isArray(payload.urls)) {
      const result = await downloadUrlsAsFile(payload.filename || 'download', payload.urls, {
        sender,
        requestId,
        totalBytes: Number(payload.totalBytes) || 0,
      });
      return { installed: true, ...result };
    }

    if (payload.url) {
      const dataUrl = await fetchAsDataUrl(payload.url);
      return { data: dataUrl, installed: true };
    }

    return { installed: true, error: 'Unsupported request' };
  } catch (error) {
    return {
      installed: true,
      error: error && error.message ? error.message : String(error),
    };
  }
}

// Support both callback-style and Promise-style message APIs.
if (runtimeApi && runtimeApi.onMessageExternal) {
  runtimeApi.onMessageExternal.addListener((message, sender, sendResponse) => {
    const resultPromise = handleMessage(message, sender);
    if (typeof sendResponse === 'function') {
      resultPromise.then(sendResponse);
      return true; // keep the message channel open for async response
    }
    return resultPromise;
  });
}

if (runtimeApi && runtimeApi.onMessage) {
  runtimeApi.onMessage.addListener((message, sender, sendResponse) => {
    const resultPromise = handleMessage(message, sender);
    if (typeof sendResponse === 'function') {
      resultPromise.then(sendResponse);
      return true;
    }
    return resultPromise;
  });
}
