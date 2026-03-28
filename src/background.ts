/// <reference types="chrome" />
// Minimal background service worker (TypeScript)
chrome.runtime.onInstalled.addListener((details?: chrome.runtime.InstalledDetails) => {
  if (details?.reason === 'install') {
    chrome.tabs.create({ url: 'onboarding.html' });
  }
});

// Badge updates from content script
chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender) => {
  if (message?.type === 'SET_BADGE' && sender.tab?.id) {
    const count = message.count || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#059669', tabId: sender.tab.id });
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
