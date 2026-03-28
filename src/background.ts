/// <reference types="chrome" />
// Minimal background service worker (TypeScript)
chrome.runtime.onInstalled.addListener((details?: chrome.runtime.InstalledDetails) => {
  if (details?.reason === 'install') {
    chrome.tabs.create({ url: 'onboarding.html' });
  }
});

// Keyboard shortcut — relay to the active tab's content script
chrome.commands.onCommand.addListener((command: string) => {
  if (command === 'trigger-promptshield') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'PROMPTSHIELD_TRIGGER' });
      }
    });
  }
});
