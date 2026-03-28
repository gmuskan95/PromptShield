declare const chrome: any;

const SETTINGS_KEY = 'promptshield_settings_v1';

function applyTheme(theme: string) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

function updateThemeBtns(active: string) {
  document.querySelectorAll<HTMLButtonElement>('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeVal === active);
  });
}

function updatePreview(style: string) {
  const examples: Record<string, string> = {
    generic:  'alice@example.com -> [EMAIL]',
    numbered: 'alice@example.com -> [EMAIL_1]',
    hashed:   'alice@example.com -> [EMAIL_a3f9c1]',
  };
  const el = document.getElementById('style-preview');
  if (el) el.textContent = examples[style] || examples['generic'];
}

document.addEventListener('DOMContentLoaded', async () => {
  const detectNamesEl  = document.getElementById('detect-names')  as HTMLInputElement;
  const styleSelect    = document.getElementById('style')          as HTMLSelectElement;
  const saveBtn        = document.getElementById('save-settings')  as HTMLButtonElement;
  const savedMsg       = document.getElementById('saved-msg')      as HTMLElement;
  const blocklistEl    = document.getElementById('blocklist')      as HTMLTextAreaElement | null;
  const alwaysRedactCbs = document.querySelectorAll<HTMLInputElement>('input[data-always-redact]');

  const defaults = { detectNames: false, style: 'generic', theme: 'system', disabledHosts: [] as string[], blocklist: [] as string[], alwaysRedact: [] as string[] };
  let settings: typeof defaults = { ...defaults };

  // Load saved settings
  if (chrome?.storage?.sync) {
    await new Promise<void>(res => {
      chrome.storage.sync.get([SETTINGS_KEY], (items: any) => {
        settings = Object.assign(defaults, items[SETTINGS_KEY] || {});
        res();
      });
    });
  }

  // Apply loaded values
  detectNamesEl.checked = !!settings.detectNames;
  styleSelect.value     = settings.style || 'generic';
  applyTheme(settings.theme || 'system');
  updateThemeBtns(settings.theme || 'system');
  updatePreview(settings.style || 'generic');

  if (blocklistEl) {
    blocklistEl.value = (settings.blocklist || []).join('\n');
  }
  alwaysRedactCbs.forEach(cb => {
    cb.checked = (settings.alwaysRedact || []).includes(cb.dataset.alwaysRedact!);
  });

  // Style preview live update
  styleSelect.addEventListener('change', () => updatePreview(styleSelect.value));

  // Theme buttons
  document.querySelectorAll<HTMLButtonElement>('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.themeVal || 'system';
      settings.theme = val;
      applyTheme(val);
      updateThemeBtns(val);
    });
  });

  // OS theme change
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') applyTheme('system');
  });

  // Save
  saveBtn.addEventListener('click', () => {
    settings.detectNames = detectNamesEl.checked;
    settings.style       = styleSelect.value;

    if (blocklistEl) {
      settings.blocklist = blocklistEl.value
        .split('\n')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
    }
    settings.alwaysRedact = Array.from(alwaysRedactCbs)
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.alwaysRedact!);

    const obj: any = {};
    obj[SETTINGS_KEY] = settings;
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set(obj, () => {
        savedMsg.classList.add('show');
        setTimeout(() => savedMsg.classList.remove('show'), 1500);
      });
    }
  });
});

export {};
