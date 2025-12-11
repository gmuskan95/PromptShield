/// <reference types="chrome" />
// Minimal background service worker (TypeScript)
chrome.runtime.onInstalled.addListener((details?: chrome.runtime.InstalledDetails) => {
  console.log('PromptShield installed/updated', details);

  // If this is a fresh install, optionally open an options page (adjust path as needed)
  if (details?.reason === 'install') {
    try {
      chrome.tabs.create({ url: 'options.html' });
    } catch (e) {
      // swallow errors in service worker context
      console.warn('Could not open options page:', e);
    }
  }
});

// Simple message listener example (responds "pong" to "ping")
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message === 'ping') {
    sendResponse('pong');
    return false; // synchronous response
  }
  // return true if responding asynchronously
  return false;
});
