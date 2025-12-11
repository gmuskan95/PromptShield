// Simple PII detection and redaction engine (TypeScript)
declare global {
  interface Window { PromptShieldDetector?: any }
}

import { detectPII, redact } from './detector-core';

(function(){
  // expose a simple global API for the extension runtime
  try{
    (window as any).PromptShieldDetector = { detectPII, redact };
  }catch(e){
    // ignore (server-side tests may not have window)
  }
})();

export {};
