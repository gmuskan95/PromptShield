declare const chrome: any;

const SETTINGS_KEY = 'promptshield_settings_v1';

// Apply theme to <html> element so CSS [data-theme] selectors work
function applyTheme(theme: string) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

document.addEventListener('DOMContentLoaded', async () => {
  const siteEnabledToggle = document.getElementById('site-enabled')   as HTMLInputElement;
  const siteHostnameEl    = document.getElementById('site-hostname')   as HTMLElement;
  const siteStatusEl      = document.getElementById('site-status')     as HTMLElement;
  const siteCard          = document.getElementById('site-card')       as HTMLElement;
  const detectNames       = document.getElementById('detect-names')    as HTMLInputElement;
  const styleSelect       = document.getElementById('style')           as HTMLSelectElement;
  const previewEl         = document.getElementById('style-preview')   as HTMLElement;
  const save              = document.getElementById('save')            as HTMLButtonElement;
  const savedMsg          = document.getElementById('saved-msg')       as HTMLElement;
  const themeBtns         = document.querySelectorAll<HTMLButtonElement>('.theme-btn');
  const blocklistEl       = document.getElementById('blocklist')       as HTMLTextAreaElement | null;
  const alwaysRedactCbs   = document.querySelectorAll<HTMLInputElement>('input[data-always-redact]');

  // ── Load settings ──────────────────────────────────────────────────────────
  const defaults = { detectNames: false, style: 'generic', theme: 'system', disabledHosts: [] as string[], blocklist: [] as string[], alwaysRedact: [] as string[] };
  let settings: typeof defaults = { ...defaults };

  if (chrome?.storage?.sync) {
    await new Promise<void>(res => {
      chrome.storage.sync.get([SETTINGS_KEY], (items: any) => {
        settings = Object.assign(defaults, items[SETTINGS_KEY] || {});
        res();
      });
    });
  }

  detectNames.checked = !!settings.detectNames;
  styleSelect.value   = settings.style || 'generic';
  updatePreview();
  applyTheme(settings.theme || 'system');
  updateThemeBtns(settings.theme || 'system');

  if (blocklistEl) {
    blocklistEl.value = (settings.blocklist || []).join('\n');
  }
  alwaysRedactCbs.forEach(cb => {
    cb.checked = (settings.alwaysRedact || []).includes(cb.dataset.alwaysRedact!);
  });

  // ── Site toggle — only present in popup.html, not options.html ────────────
  if (siteEnabledToggle && siteHostnameEl && siteStatusEl && siteCard) {
    const SUPPORTED = new Set([
      'claude.ai', 'chat.openai.com', 'chatgpt.com', 'perplexity.ai',
      'gemini.google.com', 'copilot.microsoft.com', 'you.com', 'poe.com',
      'huggingface.co', 'chat.mistral.ai', 'chat.lmsys.org',
    ]);

    let currentHost = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        currentHost = new URL(tab.url).hostname.replace(/^www\./, '');
        const isSupported = SUPPORTED.has(currentHost);

        siteHostnameEl.textContent = currentHost;

        if (!isSupported) {
          siteCard.classList.add('unsupported');
          siteStatusEl.textContent = 'Not a supported AI chat site';
          siteEnabledToggle.disabled = true;
        } else {
          const isDisabled = (settings.disabledHosts || []).includes(currentHost);
          siteEnabledToggle.checked = !isDisabled;
          updateSiteStatus();
        }
      }
    } catch (_) {
      siteHostnameEl.textContent = 'Unknown site';
      siteStatusEl.textContent   = '';
      siteEnabledToggle.disabled = true;
    }

    siteEnabledToggle.addEventListener('change', () => {
      const enabled = siteEnabledToggle.checked;
      const hosts: string[] = settings.disabledHosts || [];
      settings.disabledHosts = enabled
        ? hosts.filter(h => h !== currentHost)
        : [...hosts, currentHost];
      updateSiteStatus();
      persistSettings(false);
    });

    function updateSiteStatus() {
      siteStatusEl.textContent = siteEnabledToggle.checked
        ? 'Active — PII will be caught before sending'
        : 'Paused on this site';
      siteStatusEl.style.color = siteEnabledToggle.checked ? '#059669' : '#ef4444';
    }
  }

  // ── Redaction style live preview ───────────────────────────────────────────
  function updatePreview() {
    const examples: Record<string, string> = {
      generic:  'alice@example.com → [EMAIL]',
      numbered: 'alice@example.com → [EMAIL_1]',
      hashed:   'alice@example.com → [EMAIL_a3f9c1]',
    };
    previewEl.textContent = examples[styleSelect.value] || examples['generic'];
  }
  styleSelect.addEventListener('change', updatePreview);

  // ── Theme picker ───────────────────────────────────────────────────────────
  function updateThemeBtns(active: string) {
    themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeVal === active);
    });
  }

  // Also re-apply when OS preference changes (for 'system' mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') applyTheme('system');
  });

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.themeVal || 'system';
      settings.theme = val;
      applyTheme(val);
      updateThemeBtns(val);
      persistSettings(false); // save theme instantly, no confirmation flash
    });
  });

  // ── Save settings ──────────────────────────────────────────────────────────
  save.addEventListener('click', () => persistSettings(true));

  function persistSettings(showConfirmation: boolean) {
    settings.detectNames = detectNames.checked;
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
        if (showConfirmation) {
          savedMsg.classList.add('show');
          setTimeout(() => savedMsg.classList.remove('show'), 1200);
        }
      });
    }
  }
});

export {};
