(function () {
  const runtimeApi = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  const SOURCE_PAGE = 'disbox-page';
  const SOURCE_EXTENSION = 'disbox-extension';

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_PAGE || data.type !== 'DISBOX_FETCH') return;

    const requestId = data.requestId;
    try {
      const response = await runtimeApi.sendMessage({
        requestId,
        message: data.message || data.payload || {},
      });
      window.postMessage(
        {
          source: SOURCE_EXTENSION,
          type: 'DISBOX_FETCH_RESPONSE',
          requestId,
          response,
        },
        '*',
      );
    } catch (error) {
      window.postMessage(
        {
          source: SOURCE_EXTENSION,
          type: 'DISBOX_FETCH_RESPONSE',
          requestId,
          response: { error: error && error.message ? error.message : String(error) },
        },
        '*',
      );
    }
  });

  if (runtimeApi && runtimeApi.onMessage) {
    runtimeApi.onMessage.addListener((message) => {
      if (!message || message.type !== 'DISBOX_FETCH_PROGRESS' || !message.requestId) return;
      window.postMessage(
        {
          source: SOURCE_EXTENSION,
          type: 'DISBOX_FETCH_PROGRESS',
          requestId: message.requestId,
          progress: message.progress || {},
        },
        '*',
      );
    });
  }
})();
