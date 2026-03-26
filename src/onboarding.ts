declare const chrome: any;

document.getElementById('open-settings')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
