declare const chrome: any;
declare global { interface Window { PromptShieldDetector?: any }}

(function(){
  const SETTINGS_KEY = 'promptshield_settings_v1';

  function getSettings(){
    return new Promise<any>(res=>{
      if(chrome && chrome.storage && chrome.storage.local){
        chrome.storage.local.get([SETTINGS_KEY], (items: any)=>{
          res(Object.assign({detectNames:false, style:'generic', autoPreview:true}, items[SETTINGS_KEY]||{}));
        });
      } else res({detectNames:false, style:'generic', autoPreview:true});
    });
  }

  function createModal(original: string, redacted: string, map: any){
    const id = 'promptshield-modal';
    let existing = document.getElementById(id);
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(0,0,0,0.7) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      font-size: 14px !important;
      line-height: 1.5 !important;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      width: 720px !important;
      max-width: 95% !important;
      max-height: 90vh !important;
      background: #ffffff !important;
      border-radius: 12px !important;
      padding: 24px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
      color: #000000 !important;
      overflow-y: auto !important;
    `;

    box.innerHTML = `
      <h3 style="margin:0 0 16px 0 !important;font-size:18px !important;font-weight:600 !important;color:#000 !important;">🛡️ PromptShield detected PII</h3>
      <div style="display:flex !important;gap:16px !important;margin-bottom:16px !important;">
        <div style="flex:1 !important;">
          <strong style="display:block !important;margin-bottom:8px !important;color:#000 !important;">Original text:</strong>
          <pre style="white-space:pre-wrap !important;max-height:240px !important;overflow:auto !important;background:#f5f5f5 !important;padding:12px !important;border-radius:6px !important;margin:0 !important;font-size:13px !important;color:#000 !important;border:1px solid #ddd !important;">${escapeHtml(original)}</pre>
        </div>
        <div style="flex:1 !important;">
          <strong style="display:block !important;margin-bottom:8px !important;color:#000 !important;">Redacted version:</strong>
          <pre id="ps-redacted" style="white-space:pre-wrap !important;max-height:240px !important;overflow:auto !important;background:#fff3cd !important;padding:12px !important;border-radius:6px !important;margin:0 !important;font-size:13px !important;color:#000 !important;border:1px solid #ffc107 !important;">${escapeHtml(redacted)}</pre>
        </div>
      </div>
      <div style="margin-top:16px !important;display:flex !important;gap:10px !important;justify-content:flex-end !important;">
        <button id="ps-cancel" style="padding:10px 20px !important;background:#6c757d !important;color:#fff !important;border:none !important;border-radius:6px !important;cursor:pointer !important;font-size:14px !important;font-weight:500 !important;">Cancel</button>
        <button id="ps-send-anyway" style="padding:10px 20px !important;background:#dc3545 !important;color:#fff !important;border:none !important;border-radius:6px !important;cursor:pointer !important;font-size:14px !important;font-weight:500 !important;">Send Original</button>
        <button id="ps-send" style="padding:10px 20px !important;background:#28a745 !important;color:#fff !important;border:none !important;border-radius:6px !important;cursor:pointer !important;font-size:14px !important;font-weight:500 !important;">✓ Send Redacted</button>
      </div>
      <details style="margin-top:16px !important;color:#666 !important;font-size:12px !important;">
        <summary style="cursor:pointer !important;color:#000 !important;">Show redaction map</summary>
        <pre style="white-space:pre-wrap !important;margin-top:8px !important;background:#f5f5f5 !important;padding:8px !important;border-radius:4px !important;font-size:11px !important;color:#000 !important;">${escapeHtml(JSON.stringify(map,null,2))}</pre>
      </details>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    console.log('[PromptShield] Modal created and added to DOM');
    return overlay;
  }

  function escapeHtml(s: string){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function findActiveText(): HTMLElement | null {
    const el = document.activeElement as HTMLElement | null;

    // Check if active element is a text input
    if(el) {
      if(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /text|search|email|tel|url/.test((el as HTMLInputElement).type))) return el;
      if(el.isContentEditable || el.getAttribute('contenteditable') === 'true') return el;
      // Check if active element is inside a contenteditable (for nested structures)
      const editableParent = el.closest('[contenteditable="true"]');
      if(editableParent) return editableParent as HTMLElement;
    }

    // Fallback: try to find any visible text input on the page
    // Try contenteditable first (most modern chat UIs)
    const contentEditables = document.querySelectorAll('[contenteditable="true"]');
    for(let i = 0; i < contentEditables.length; i++) {
      const ce = contentEditables[i] as HTMLElement;
      // Check if element is visible
      if(ce.offsetParent !== null && (ce.innerText || ce.textContent)) {
        console.log('[PromptShield] Found contenteditable with text');
        return ce;
      }
    }

    // Try textarea
    const ta = document.querySelector('textarea');
    if(ta && (ta as HTMLTextAreaElement).value) return ta as HTMLElement;

    // Try input fields
    const inp = document.querySelector('input[type="text"], input[type="search"]');
    if(inp && (inp as HTMLInputElement).value) return inp as HTMLElement;

    console.log('[PromptShield] Could not find text input element');
    return null;
  }

  async function handleSendInterception(e: Event | null, sendCallback: () => void){
    const targetEl = findActiveText();
    if(!targetEl) {
      console.log('[PromptShield] No active text element found');
      return sendCallback();
    }
    const text = (targetEl as any).isContentEditable ? targetEl.innerText : (targetEl as HTMLInputElement).value;
    console.log('[PromptShield] Found text to check:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    const settings = await getSettings();
    const matches = window.PromptShieldDetector.detectPII(text, {detectNames: settings.detectNames});
    console.log('[PromptShield] PII matches found:', matches.length);
    if(matches.length === 0) {
      console.log('[PromptShield] No PII detected, allowing send');
      return sendCallback();
    }

    const {redacted, map} = window.PromptShieldDetector.redact(text, matches, settings.style);
    const modal = createModal(text, redacted, map);

    modal.querySelector('#ps-send')!.addEventListener('click', ()=>{
      if((targetEl as any).isContentEditable) (targetEl as any).innerText = redacted;
      else (targetEl as HTMLInputElement).value = redacted;
      modal.remove();
      saveMap(map);
      sendCallback();
    });
    modal.querySelector('#ps-send-anyway')!.addEventListener('click', ()=>{
      modal.remove();
      sendCallback();
    });
    modal.querySelector('#ps-cancel')!.addEventListener('click', ()=>{
      modal.remove();
    });
  }

  function saveMap(map: any){
    try{
      const key = 'promptshield_map_history_v1';
      if(chrome && chrome.storage && chrome.storage.local){
        chrome.storage.local.get([key], (items: any)=>{
          const arr = items[key] || [];
          arr.unshift({time:Date.now(), map});
          if(arr.length>50) arr.length = 50;
          const obj: any = {};
          obj[key] = arr;
          chrome.storage.local.set(obj);
        });
      }
    }catch(err){console.warn(err)}
  }

  let globalClickHandler: any = null;
  let isHandlerActive = true;

  function attachGlobalListeners(){
    globalClickHandler = function(e: Event){
      // Skip if handler is temporarily disabled
      if(!isHandlerActive) return;

      const el = e.target as HTMLElement;

      // Skip if this is inside our modal
      if(el.closest && el.closest('#promptshield-modal')) {
        console.log('[PromptShield] Click inside our modal, ignoring');
        return;
      }

      const btn = el.closest && (el.closest('button,input[type="button"],input[type="submit"]') as HTMLElement | null);
      if(!btn) return;

      // Collect all possible text sources from the button
      const buttonText = (btn.innerText || (btn as HTMLInputElement).value || '').toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const dataTestId = (btn.getAttribute('data-testid') || '').toLowerCase();

      // Combine all text sources
      const combinedText = `${buttonText} ${ariaLabel} ${title} ${dataTestId}`;

      console.log('[PromptShield] Button clicked:', { buttonText, ariaLabel, title, dataTestId, combinedText });

      // Check if any of the text sources match our pattern
      if(/send|submit|reply|generate|ask|post|publish|share/i.test(combinedText)){
        console.log('[PromptShield] Button matched send pattern, intercepting...');
        // CRITICAL: Prevent the event IMMEDIATELY before any async work
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation && (e as any).stopImmediatePropagation();

        handleSendInterception(e, ()=>{
          console.log('[PromptShield] Executing send callback...');
          // Temporarily disable our handler, trigger real click, then re-enable
          isHandlerActive = false;
          setTimeout(() => {
            console.log('[PromptShield] Triggering actual send...');
            btn.click();
            // Re-enable handler after a short delay
            setTimeout(() => {
              isHandlerActive = true;
              console.log('[PromptShield] Handler re-enabled');
            }, 100);
          }, 0);
        });
      }
    };

    document.addEventListener('click', globalClickHandler, true);

    document.addEventListener('keydown', function(e){
      if((e as KeyboardEvent).key === 'Enter' && ((e as KeyboardEvent).metaKey || (e as KeyboardEvent).ctrlKey)){
        console.log('[PromptShield] Cmd/Ctrl+Enter detected, intercepting...');
        handleSendInterception(e, ()=>{});
      }
    }, true);

    // Fallback: intercept form submissions
    document.addEventListener('submit', function(e){
      console.log('[PromptShield] Form submit detected, intercepting...');
      handleSendInterception(e, ()=>{
        const form = e.target as HTMLFormElement;
        if(form && form.submit) {
          form.submit();
        }
      });
    }, true);
  }

  function init(){
    attachGlobalListeners();
    console.log('PromptShield content script initialized');
  }

  init();
})();

export {};
