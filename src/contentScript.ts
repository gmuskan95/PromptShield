declare const chrome: any;
import { detectPII, redact } from './detector-core';

(function () {
  console.log('[PromptShield] content script loaded on', location.hostname);
  const SETTINGS_KEY = 'promptshield_settings_v1';

  // ---------------------------------------------------------------------------
  // Per-site selectors — precise targeting beats generic text matching
  // Each site can declare inputSelector and/or sendSelector.
  // Falls back to generic heuristics if neither fires.
  // ---------------------------------------------------------------------------
  const SITE_CONFIGS: Record<string, { inputSelector?: string; sendSelector?: string }> = {
    'chat.openai.com': {
      inputSelector: '#prompt-textarea',
      sendSelector: '[data-testid="send-button"]',
    },
    'chatgpt.com': {
      inputSelector: '#prompt-textarea',
      sendSelector: '[data-testid="send-button"]',
    },
    'claude.ai': {
      inputSelector: '[contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"]',
    },
    'gemini.google.com': {
      inputSelector: '.ql-editor[contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"]',
    },
    'perplexity.ai': {
      inputSelector: 'textarea[placeholder]',
      sendSelector: 'button[aria-label*="Submit"]',
    },
    'copilot.microsoft.com': {
      inputSelector: 'textarea[name="q"], [contenteditable="true"]',
      sendSelector: 'button[aria-label*="Submit"], button[aria-label*="Send"]',
    },
    'you.com': {
      inputSelector: 'textarea[id*="search"]',
      sendSelector: 'button[type="submit"]',
    },
    'poe.com': {
      inputSelector: 'textarea[class*="GrowingTextArea"]',
      sendSelector: 'button[class*="SendButton"]',
    },
    'huggingface.co': {
      inputSelector: 'textarea',
      sendSelector: 'button[type="submit"]',
    },
    'chat.mistral.ai': {
      inputSelector: 'textarea',
      sendSelector: 'button[type="submit"]',
    },
    'chat.lmsys.org': {
      inputSelector: 'textarea',
      sendSelector: 'button[id*="send"]',
    },
    'notion.so': {
      inputSelector: '[contenteditable="true"][placeholder="Do anything with AI…"]',
      sendSelector: '[aria-label="Submit AI message"]',
    },
    'slack.com': {
      inputSelector: '.ql-editor[contenteditable="true"], [data-qa="message_input"] [contenteditable="true"]',
      sendSelector: 'button[data-qa="texty_send_button"]',
    },
    'linear.app': {
      inputSelector: '[contenteditable="true"]',
      sendSelector: 'button[type="submit"]',
    },
    'github.com': {
      inputSelector: '#copilot-chat-input, textarea[name="copilot-chat-input"], [contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"], button[data-testid*="send"]',
    },
    'teams.microsoft.com': {
      inputSelector: '[contenteditable="true"][aria-label*="message"], div[role="textbox"]',
      sendSelector: 'button[aria-label*="Send"]',
    },
    'intercom.com': {
      inputSelector: '[contenteditable="true"]',
      sendSelector: 'button[aria-label*="Send"], button[data-testid*="send"]',
    },
  };

  function getSiteConfig() {
    const host = location.hostname.replace(/^www\./, '');
    return SITE_CONFIGS[host] || {};
  }

  // ---------------------------------------------------------------------------
  // Settings — uses chrome.storage.sync so prefs follow the user across devices.
  // No PII is ever written to storage.
  // ---------------------------------------------------------------------------
  function getSettings(): Promise<any> {
    return new Promise(res => {
      const defaults = {
        detectNames: false,
        style: 'generic',
        autoPreview: true,
        disabledHosts: [] as string[],
        blocklist: [] as string[],
        alwaysRedact: [] as string[],
      };
      if (chrome?.storage?.sync) {
        chrome.storage.sync.get([SETTINGS_KEY], (items: any) => {
          res(Object.assign(defaults, items[SETTINGS_KEY] || {}));
        });
      } else {
        res(defaults);
      }
    });
  }

  function isDisabledForCurrentHost(settings: any): boolean {
    const host = location.hostname.replace(/^www\./, '');
    return Array.isArray(settings.disabledHosts) && settings.disabledHosts.includes(host);
  }

  // ---------------------------------------------------------------------------
  // Modal — inline pill toggling. Click a highlighted item to keep it as-is.
  // No checkboxes, no preview textarea, no extra UI. Just the prompt with
  // sensitive items highlighted. Click = toggle redaction. One Send button.
  // ---------------------------------------------------------------------------
  function createModal(
    original: string,
    matches: import('./detector-core').Match[],
    style: string,
  ): Promise<'cancel' | string> {
    return new Promise(resolve => {
      // Remove any stale modal
      document.getElementById('promptshield-host')?.remove();

      const redacting = matches.map(() => true);
      let resolved = false;

      // ── Shadow DOM host — page JS cannot read inside or observe pill content ──
      const hostEl = document.createElement('div');
      hostEl.id = 'promptshield-host';
      // The host itself is visible to page JS (it's in the DOM) but its internals are not.
      hostEl.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;';

      const shadow = hostEl.attachShadow({ mode: 'closed' }); // closed = no external .shadowRoot access

      // Styles injected into the shadow root (not affected by page CSS)
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif; }
        #overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.6);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; line-height: 1.6;
        }
        #box {
          width: 620px; max-width: 95vw; max-height: 88vh;
          background: #fff; border-radius: 18px;
          box-shadow: 0 8px 48px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.1);
          color: #0f172a; overflow: hidden;
          display: flex; flex-direction: column;
        }
        #ps-modal-header {
          background: linear-gradient(135deg, #2e1065 0%, #065f46 50%, #4c1d95 100%);
          padding: 16px 20px 14px;
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 10px; position: relative; overflow: hidden; flex-shrink: 0;
        }
        #ps-modal-header::after {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at 85% 50%, rgba(52,211,153,0.2) 0%, transparent 70%);
          pointer-events: none;
        }
        #ps-header-left { display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
        #ps-header-icon {
          width: 36px; height: 36px; flex-shrink: 0;
          background: rgba(255,255,255,0.12); border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        #ps-header-text { }
        #ps-title { font-size: 14.5px; font-weight: 700; color: #fff; letter-spacing: -0.2px; line-height: 1.2; }
        #ps-subtitle { font-size: 11.5px; color: rgba(255,255,255,0.7); margin-top: 2px; }
        #ps-close-x {
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
          border-radius: 6px; font-size: 14px;
          cursor: pointer; color: rgba(255,255,255,0.8); line-height: 1;
          padding: 5px 8px; flex-shrink: 0;
          position: relative; z-index: 1;
          transition: background 0.15s;
        }
        #ps-close-x:hover { background: rgba(255,255,255,0.22); }
        #ps-body {
          padding: 16px 20px; overflow-y: auto; flex: 1;
          display: flex; flex-direction: column; gap: 14px;
        }
        #ps-prompt {
          font-size: 13.5px; line-height: 1.8;
          background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 10px; padding: 14px 16px;
          word-break: break-word; white-space: pre-wrap;
          max-height: 280px; overflow-y: auto;
          color: #334155;
        }
        .pill-on {
          display: inline-block;
          background: #d1fae5; border: 1.5px solid #059669;
          color: #065f46; border-radius: 5px;
          padding: 1px 7px; cursor: pointer;
          font-weight: 600; font-size: 0.91em;
          white-space: nowrap; user-select: none;
          text-decoration: line-through; text-decoration-color: #059669;
          transition: background 0.12s, border-color 0.12s;
        }
        .pill-on:hover { background: #a7f3d0; border-color: #047857; }
        .pill-off {
          display: inline-block;
          background: #f1f5f9; border: 1.5px solid #cbd5e1;
          color: #475569; border-radius: 5px;
          padding: 1px 7px; cursor: pointer;
          font-weight: 500; font-size: 0.91em;
          white-space: nowrap; user-select: none;
          transition: background 0.12s, border-color 0.12s;
        }
        .pill-off:hover { background: #e2e8f0; border-color: #94a3b8; }
        sup {
          font-size: 8.5px; margin-left: 3px; font-weight: 500;
          text-decoration: none; opacity: 0.75; vertical-align: super;
          letter-spacing: 0.3px;
        }
        .conf-dot {
          display: inline-block; width: 5px; height: 5px; border-radius: 50%;
          margin-left: 3px; vertical-align: middle; flex-shrink: 0;
        }
        .conf-high  { background: #059669; }
        .conf-medium { background: #f59e0b; }
        .conf-low   { background: #94a3b8; }
        .legend-row {
          display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
        }
        .legend {
          font-size: 11.5px; color: #64748b;
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 8px 12px; background: #f8fafc; border-radius: 8px;
          border: 1px solid #e2e8f0; flex: 1;
        }
        .legend-item { display: inline-flex; align-items: center; gap: 5px; }
        .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .legend-sep { color: #cbd5e1; }
        .toggle-all-btns { display: flex; gap: 5px; flex-shrink: 0; }
        .toggle-all-btn {
          font-size: 11px; padding: 4px 9px; border-radius: 6px; cursor: pointer;
          border: 1px solid #e2e8f0; background: #f8fafc; color: #475569;
          font-weight: 500; white-space: nowrap;
          transition: background 0.12s, border-color 0.12s;
        }
        .toggle-all-btn:hover { background: #e2e8f0; border-color: #cbd5e1; }
        .actions {
          display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;
          padding: 12px 20px; border-top: 1px solid #e2e8f0;
          background: #f8fafc; flex-shrink: 0;
        }
        #ps-cancel {
          padding: 9px 18px; background: #fff; color: #475569;
          border: 1.5px solid #e2e8f0; border-radius: 9px;
          cursor: pointer; font-size: 13px; font-weight: 500;
          transition: background 0.15s, border-color 0.15s;
        }
        #ps-cancel:hover { background: #f1f5f9; border-color: #cbd5e1; }
        #ps-send-raw {
          padding: 9px 16px; background: #fff; color: #64748b;
          border: 1.5px solid #e2e8f0; border-radius: 9px;
          cursor: pointer; font-size: 13px; font-weight: 500;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        #ps-send-raw:hover { background: #f8fafc; border-color: #94a3b8; color: #374151; }
        #ps-send {
          padding: 9px 22px; background: #059669; color: #fff;
          border: none; border-radius: 9px;
          cursor: pointer; font-size: 13px; font-weight: 600;
          min-width: 110px; letter-spacing: 0.1px;
          box-shadow: 0 2px 8px rgba(5,150,105,0.3);
          transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
        }
        #ps-send:hover { background: #047857; box-shadow: 0 4px 12px rgba(5,150,105,0.35); }
        #ps-send:active { transform: scale(0.97); }
        #ps-send:disabled { background: #94a3b8; box-shadow: none; cursor: default; }
      `;

      const overlay = document.createElement('div');
      overlay.id = 'overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'PromptShield — review before sending');

      const box = document.createElement('div');
      box.id = 'box';

      // ── Branded header ──
      const modalHeader = document.createElement('div');
      modalHeader.id = 'ps-modal-header';

      const headerLeft = document.createElement('div');
      headerLeft.id = 'ps-header-left';

      const headerIcon = document.createElement('div');
      headerIcon.id = 'ps-header-icon';
      headerIcon.textContent = '🛡️';

      const headerText = document.createElement('div');
      headerText.id = 'ps-header-text';
      const title = document.createElement('div');
      title.id = 'ps-title';
      title.textContent = 'Sensitive info detected';
      const subtitle = document.createElement('div');
      subtitle.id = 'ps-subtitle';
      headerText.append(title, subtitle);
      headerLeft.append(headerIcon, headerText);

      const closeBtn = document.createElement('button');
      closeBtn.id = 'ps-close-x';
      closeBtn.setAttribute('aria-label', 'Cancel and go back');
      closeBtn.textContent = '✕';
      modalHeader.append(headerLeft, closeBtn);

      // ── Scrollable body ──
      const body = document.createElement('div');
      body.id = 'ps-body';

      // Prompt display — built once, pills updated in-place on toggle
      const promptEl = document.createElement('div');
      promptEl.id = 'ps-prompt';

      // Legend
      const legend = document.createElement('div');
      legend.className = 'legend';

      const legendGreen = document.createElement('span');
      legendGreen.className = 'legend-item';
      const swatchGreen = document.createElement('span');
      swatchGreen.className = 'swatch';
      swatchGreen.style.cssText = 'background:#d1fae5;border:1.5px solid #059669;';
      const labelGreen = document.createElement('span');
      labelGreen.innerHTML = '<strong style="color:#065f46;">Green</strong> = hidden from AI';
      legendGreen.append(swatchGreen, labelGreen);

      const legendSep = document.createElement('span');
      legendSep.className = 'legend-sep';
      legendSep.textContent = '·';

      const legendGrey = document.createElement('span');
      legendGrey.className = 'legend-item';
      const swatchGrey = document.createElement('span');
      swatchGrey.className = 'swatch';
      swatchGrey.style.cssText = 'background:#f1f5f9;border:1.5px solid #cbd5e1;';
      const labelGrey = document.createElement('span');
      labelGrey.innerHTML = '<strong style="color:#475569;">Grey</strong> = sent as-is';
      legendGrey.append(swatchGrey, labelGrey);

      legend.append(legendGreen, legendSep, legendGrey);

      // Redact all / Reveal all buttons
      const toggleAllBtns = document.createElement('div');
      toggleAllBtns.className = 'toggle-all-btns';
      const redactAllBtn = document.createElement('button');
      redactAllBtn.className = 'toggle-all-btn';
      redactAllBtn.textContent = 'Redact all';
      const revealAllBtn = document.createElement('button');
      revealAllBtn.className = 'toggle-all-btn';
      revealAllBtn.textContent = 'Reveal all';
      toggleAllBtns.append(redactAllBtn, revealAllBtn);

      const legendRow = document.createElement('div');
      legendRow.className = 'legend-row';
      legendRow.append(legend, toggleAllBtns);

      // Shift+Enter hint
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:#94a3b8;text-align:right;margin-top:-6px;';
      hint.textContent = 'Tip: Shift+Enter for a new line';

      body.append(promptEl, legendRow, hint);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'ps-cancel';
      cancelBtn.textContent = 'Cancel';
      const sendRawBtn = document.createElement('button');
      sendRawBtn.id = 'ps-send-raw';
      sendRawBtn.textContent = 'Send without redacting';
      const sendBtn = document.createElement('button');
      sendBtn.id = 'ps-send';
      actions.append(cancelBtn, sendRawBtn, sendBtn);

      box.append(modalHeader, body, actions);
      overlay.appendChild(box);
      shadow.append(styleEl, overlay);
      document.body.appendChild(hostEl);

      // ── Build prompt display — one Text/Element node per segment, pills as spans ──
      // We keep references to each pill span so we can update them in-place
      // instead of rebuilding innerHTML on every toggle (important for long prompts).
      const pillEls: HTMLElement[] = [];

      function buildPromptNodes() {
        promptEl.innerHTML = '';
        let cursor = 0;
        matches.forEach((m, i) => {
          if (m.index > cursor) {
            promptEl.appendChild(document.createTextNode(original.slice(cursor, m.index)));
          }
          const pill = document.createElement('span');
          pill.dataset.idx = String(i);
          const sup = document.createElement('sup');
          sup.textContent = m.type;
          const dot = document.createElement('span');
          dot.className = `conf-dot conf-${m.confidence}`;
          dot.title = `${m.confidence} confidence`;
          sup.appendChild(dot);
          pill.append(document.createTextNode(m.match), sup);
          pillEls.push(pill);
          promptEl.appendChild(pill);
          cursor = m.index + m.length;
        });
        if (cursor < original.length) {
          promptEl.appendChild(document.createTextNode(original.slice(cursor)));
        }
      }

      // Update a single pill's appearance in-place — no full re-render
      function updatePill(i: number) {
        const pill = pillEls[i];
        if (!pill) return;
        if (redacting[i]) {
          pill.className = 'pill-on';
          pill.title = `Click to keep in message`;
          pill.setAttribute('aria-label', `${matches[i].type} will be hidden. Click to send as-is.`);
        } else {
          pill.className = 'pill-off';
          pill.title = `Click to hide from AI`;
          pill.setAttribute('aria-label', `${matches[i].type} will be sent. Click to hide from AI.`);
        }
      }

      function updateHeader() {
        const n = redacting.filter(Boolean).length;
        subtitle.textContent = n === 0
          ? 'Everything will be sent to the AI. Tap any item to hide it.'
          : `${n} item${n !== 1 ? 's' : ''} will be hidden. Tap any green item to reveal it.`;
        sendBtn.textContent = n > 0 ? '🛡️ Send (with redaction)' : 'Send as-is';
      }

      buildPromptNodes();
      matches.forEach((_, i) => updatePill(i)); // set initial styles
      updateHeader();

      function buildFinalText(): string {
        const active = matches.filter((_, i) => redacting[i]);
        if (active.length === 0) return original;
        return redact(original, active, style).redacted;
      }

      // ── Focus trap — keep focus inside the shadow so typing doesn't reach the chat input ──
      // Trap on the overlay element itself; the shadow root intercepts keyboard events.
      overlay.setAttribute('tabindex', '-1');
      // Focus the send button by default — pressing Enter confirms redacted send
      setTimeout(() => sendBtn.focus(), 0);

      // Re-trap if focus escapes (e.g. user Tabs to browser chrome and back)
      shadow.addEventListener('focusout', (e: Event) => {
        const fe = e as FocusEvent;
        if (!shadow.contains(fe.relatedTarget as Node)) {
          overlay.focus();
        }
      });

      // Block all keyboard input from reaching the page while modal is open
      shadow.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Escape') { e.stopPropagation(); done('cancel'); }
        // Let Tab cycle within the shadow naturally; stop everything else
        if (ke.key !== 'Tab') e.stopPropagation();
      }, true);

      // ── Pill toggle — pointerdown for instant response ──
      promptEl.addEventListener('pointerdown', (e) => {
        const pill = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
        if (!pill) return;
        e.preventDefault();
        const idx = parseInt(pill.dataset.idx ?? '', 10);
        if (isNaN(idx) || idx < 0 || idx >= redacting.length) return;
        redacting[idx] = !redacting[idx];
        updatePill(idx);
        updateHeader();
      });

      redactAllBtn.addEventListener('click', () => {
        redacting.fill(true);
        matches.forEach((_, i) => updatePill(i));
        updateHeader();
      });
      revealAllBtn.addEventListener('click', () => {
        redacting.fill(false);
        matches.forEach((_, i) => updatePill(i));
        updateHeader();
      });

      // ── Cleanup & resolve ──
      function cleanup() {
        hostEl.remove();
      }

      function done(result: 'cancel' | string) {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      }

      closeBtn.addEventListener('click', () => done('cancel'));
      cancelBtn.addEventListener('click', () => done('cancel'));
      sendRawBtn.addEventListener('click', () => {
        sendRawBtn.disabled = true;
        sendRawBtn.textContent = 'Sending…';
        done(original);
      });
      sendBtn.addEventListener('click', () => {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';
        done(buildFinalText());
      });

      // Click on dark backdrop = cancel
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) done('cancel');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Text input detection — site-specific first, then generic fallbacks
  // ---------------------------------------------------------------------------
  function findActiveText(): HTMLElement | null {
    const cfg = getSiteConfig();

    if (cfg.inputSelector) {
      const el = document.querySelector<HTMLElement>(cfg.inputSelector);
      if (el) return el;
    }

    // Generic fallbacks
    const active = document.activeElement as HTMLElement | null;
    if (active) {
      if (active.tagName === 'TEXTAREA') return active;
      if (active.tagName === 'INPUT' && /^(text|search|email|tel|url)$/i.test((active as HTMLInputElement).type)) return active;
      if (active.isContentEditable) return active;
      const ep = active.closest<HTMLElement>('[contenteditable="true"]');
      if (ep) return ep;
    }

    const ce = document.querySelector<HTMLElement>('[contenteditable="true"]');
    if (ce?.offsetParent && (ce.innerText || ce.textContent)) return ce;

    const ta = document.querySelector<HTMLTextAreaElement>('textarea');
    if (ta?.value) return ta;

    return null;
  }

  function getText(el: HTMLElement): string {
    return el.isContentEditable ? (el.innerText || el.textContent || '') : (el as HTMLInputElement).value || '';
  }

  // Returns true if text was successfully written into the element.
  function setText(el: HTMLElement, text: string): boolean {
    try {
      if (el.isContentEditable) {
        // Verify element is still in the DOM and editable
        if (!document.contains(el) || el.getAttribute('contenteditable') === 'false') return false;

        el.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // execCommand is deprecated but remains the only cross-framework way to
        // trigger React/Vue onChange from a content script without monkey-patching.
        const inserted = document.execCommand('insertText', false, text);
        if (!inserted) {
          // Fallback: direct assignment + InputEvent
          el.innerText = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
        // Verify the text actually landed
        const actual = el.innerText || el.textContent || '';
        return actual.trim() === text.trim();
      } else {
        const input = el as HTMLInputElement;
        if (!document.contains(input) || input.disabled || input.readOnly) return false;

        // Use the native value setter so React's synthetic onChange fires
        const nativeSetter =
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
          Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, text);
        } else {
          input.value = text;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input.value === text;
      }
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Stats — counts only, no PII values ever stored
  // ---------------------------------------------------------------------------
  const STATS_KEY = 'promptshield_stats_v1';

  function recordStats(matches: import('./detector-core').Match[]) {
    if (!chrome?.storage?.local) return;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    chrome.storage.local.get([STATS_KEY], (items: any) => {
      const stats = items[STATS_KEY] || { total: 0, today: '', todayTypes: {} };
      // Reset daily counts if it's a new day
      if (stats.today !== today) {
        stats.today = today;
        stats.todayTypes = {};
      }
      stats.total = (stats.total || 0) + 1;
      for (const m of matches) {
        stats.todayTypes[m.type] = (stats.todayTypes[m.type] || 0) + 1;
      }
      chrome.storage.local.set({ [STATS_KEY]: stats });
      // Update badge with today's interception count
      chrome.runtime.sendMessage({ type: 'SET_BADGE', count: stats.total });
    });
  }

  // ---------------------------------------------------------------------------
  // Core interception logic
  // ---------------------------------------------------------------------------
  let isHandlerActive = true;

  async function handleSend(sendCallback: () => void) {
    console.log('[PromptShield] handleSend triggered');
    // Disable immediately so rapid repeat events don't stack up
    isHandlerActive = false;
    try {
      const settings = await getSettings();
      if (isDisabledForCurrentHost(settings)) { sendCallback(); return; }

      const targetEl = findActiveText();
      if (!targetEl) { sendCallback(); return; }

      const text = getText(targetEl);
      if (!text.trim()) { sendCallback(); return; }

      let matches = detectPII(text, { detectNames: settings.detectNames });

      // Inject custom blocklist matches as synthetic PII hits
      const blocklist: string[] = Array.isArray(settings.blocklist) ? settings.blocklist : [];
      for (const term of blocklist) {
        const trimmed = term.trim();
        if (!trimmed) continue;
        let idx = 0;
        while (true) {
          const pos = text.indexOf(trimmed, idx);
          if (pos === -1) break;
          matches.push({ type: 'CUSTOM', match: trimmed, index: pos, length: trimmed.length, confidence: 'high' });
          idx = pos + trimmed.length;
        }
      }

      if (matches.length === 0) { sendCallback(); return; }

      // Sort matches by index so the prompt display and redaction are correct
      matches.sort((a, b) => a.index - b.index);

      // Remove overlapping matches (keep the first one by index)
      matches = matches.filter((m, i) => {
        if (i === 0) return true;
        const prev = matches[i - 1];
        return m.index >= prev.index + prev.length;
      });

      // Always-redact: auto-redact these types silently without showing the modal
      const alwaysRedact: string[] = Array.isArray(settings.alwaysRedact) ? settings.alwaysRedact : [];
      const autoMatches = matches.filter(m => alwaysRedact.includes(m.type));
      const manualMatches = matches.filter(m => !alwaysRedact.includes(m.type));

      let baseText = text;
      if (autoMatches.length > 0) {
        baseText = redact(text, autoMatches, settings.style).redacted;
        // If all matches were auto-redacted, just send without modal
        if (manualMatches.length === 0) {
          const written = setText(targetEl, baseText);
          if (!written) return;
          sendCallback();
          return;
        }
        // Re-detect on the redacted text so modal indices stay correct
        matches = detectPII(baseText, { detectNames: settings.detectNames });
        for (const term of blocklist) {
          const trimmed = term.trim();
          if (!trimmed) continue;
          let idx = 0;
          while (true) {
            const pos = baseText.indexOf(trimmed, idx);
            if (pos === -1) break;
            matches.push({ type: 'CUSTOM', match: trimmed, index: pos, length: trimmed.length, confidence: 'high' });
            idx = pos + trimmed.length;
          }
        }
        matches.sort((a, b) => a.index - b.index);
        matches = matches.filter((m, i) => {
          if (i === 0) return true;
          const prev = matches[i - 1];
          return m.index >= prev.index + prev.length;
        });
      }

      // Show modal — all redaction happens inside createModal, nothing stored
      const result = await createModal(baseText, matches, settings.style);

      if (result === 'cancel') return; // user bailed — do not call sendCallback

      const written = setText(targetEl, result);
      if (!written) {
        // Element was removed or became read-only between detection and redaction.
        // Do not send — the original unredacted text would go out instead.
        return;
      }

      // Record stats if anything was actually redacted
      if (result !== baseText) recordStats(matches);

      sendCallback();
    } finally {
      // Always re-enable, whether we sent, cancelled, or threw
      setTimeout(() => { isHandlerActive = true; }, 150);
    }
  }

  // ---------------------------------------------------------------------------
  // Event listeners — click, keyboard, form submit
  // ---------------------------------------------------------------------------
  function isSendButton(el: HTMLElement): boolean {
    const cfg = getSiteConfig();

    // Try site-specific selector first
    if (cfg.sendSelector) {
      try { if (el.matches(cfg.sendSelector)) return true; } catch (_) {}
      try { if (el.closest(cfg.sendSelector)) return true; } catch (_) {}
    }

    // Generic text-based heuristic as fallback
    const text = [
      el.innerText,
      (el as HTMLInputElement).value,
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('data-testid'),
    ].filter(Boolean).join(' ').toLowerCase();

    return /\bsend|submit|reply|generate|ask\b/i.test(text);
  }

  function attachListeners() {
    document.addEventListener('click', function (e: Event) {
      if (!isHandlerActive) return;
      const el = e.target as HTMLElement;
      if (el.closest('#promptshield-host')) return;

      const btn = el.closest<HTMLElement>('button, input[type="button"], input[type="submit"], [role="button"]');
      if (!btn || !isSendButton(btn)) return;

      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();

      handleSend(() => {
        isHandlerActive = false;
        setTimeout(() => {
          btn.click();
          setTimeout(() => { isHandlerActive = true; }, 150);
        }, 0);
      });
    }, true);

    document.addEventListener('keydown', function (e: Event) {
      if (!isHandlerActive) return;
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Enter') return;
      if ((ke.target as HTMLElement)?.closest?.('#promptshield-host')) return;

      // Shift+Enter = newline, never intercept
      if (ke.shiftKey) return;

      // Plain Enter OR Cmd/Ctrl+Enter — both used for send across different sites
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();

      handleSend(() => {
        // Re-dispatch the original key combo after a tick
        isHandlerActive = false;
        setTimeout(() => {
          const target = findActiveText();
          if (target) {
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: ke.metaKey, ctrlKey: ke.ctrlKey, bubbles: true }));
          }
          setTimeout(() => { isHandlerActive = true; }, 150);
        }, 0);
      });
    }, true);

    document.addEventListener('submit', function (e: Event) {
      if (!isHandlerActive) return;
      e.preventDefault();
      handleSend(() => {
        isHandlerActive = false;
        const form = e.target as HTMLFormElement;
        // Use requestSubmit so native validation still runs
        setTimeout(() => {
          try { form.requestSubmit(); } catch (_) { form.submit(); }
          setTimeout(() => { isHandlerActive = true; }, 150);
        }, 0);
      });
    }, true);
  }

  // ---------------------------------------------------------------------------
  // MutationObserver — reattach nothing (listeners are on document, so they
  // survive DOM changes), but watch for SPA route changes that replace the
  // whole input area so we can keep getSiteConfig() in sync.
  // ---------------------------------------------------------------------------
  function watchForSPANavigation() {
    let lastHref = location.href;
    new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        // isHandlerActive may have been left false by a race — reset it
        isHandlerActive = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // Keyboard shortcut via background relay
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message?.type === 'PROMPTSHIELD_TRIGGER' && isHandlerActive) {
      handleSend(() => {
        const target = findActiveText();
        if (target) {
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
        }
      });
    }
  });

  function init() {
    attachListeners();
    watchForSPANavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

export {};
