/// <reference types="chrome" />
// Minimal background service worker (TypeScript)
chrome.runtime.onInstalled.addListener((details?: chrome.runtime.InstalledDetails) => {
  if (details?.reason === 'install') {
    chrome.tabs.create({ url: 'options.html' });
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
