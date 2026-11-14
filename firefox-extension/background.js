function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read downloaded data'));
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url) {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return await blobToDataUrl(blob);
}

async function handleMessage(message) {
  const payload = message && message.message ? message.message : message;

  // The web app pings with an empty message to detect installation.
  if (!payload || !payload.url) {
    return { installed: true };
  }

  try {
    const dataUrl = await fetchAsDataUrl(payload.url);
    return { data: dataUrl, installed: true };
  } catch (error) {
    return {
      installed: true,
      error: error && error.message ? error.message : String(error),
    };
  }
}

// Support both callback-style and Promise-style message APIs.
const runtimeApi = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;

if (runtimeApi && runtimeApi.onMessageExternal) {
  runtimeApi.onMessageExternal.addListener((message, sender, sendResponse) => {
    const resultPromise = handleMessage(message);
    if (typeof sendResponse === 'function') {
      resultPromise.then(sendResponse);
      return true; // keep the message channel open for async response
    }
    return resultPromise;
  });
}

if (runtimeApi && runtimeApi.onMessage) {
  runtimeApi.onMessage.addListener((message, sender, sendResponse) => {
    const resultPromise = handleMessage(message);
    if (typeof sendResponse === 'function') {
      resultPromise.then(sendResponse);
      return true;
    }
    return resultPromise;
  });
}
