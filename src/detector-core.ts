// Core detector utilities extracted for unit testing
export type Match = {
  type: string;
  match: string;
  index: number;
  length: number;
  confidence: 'high' | 'medium' | 'low';
};

// Luhn algorithm — validates credit card numbers without storing them
function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// Patterns that should suppress DATE matches (version numbers, short numeric sequences)
const DATE_SUPPRESSION = /^\d+\.\d+\.\d+$|^\d{1,2}[/-]\d{1,2}[/-]\d{1,2}$/; // e.g. 1.2.3 or 1/2/3

const DEFAULT_PATTERNS: Array<{
  type: string;
  regex: RegExp;
  confidence: 'high' | 'medium' | 'low';
  validate?: (m: string) => boolean;
}> = [
  {
    type: 'EMAIL',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    confidence: 'high',
  },
  {
    // Require at least 10 digits total to avoid short number false positives
    type: 'PHONE',
    regex: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])?\d{3,4}[\s.-]?\d{4}/g,
    confidence: 'medium',
    validate: (m) => m.replace(/\D/g, '').length >= 10,
  },
  {
    type: 'IP_ADDRESS',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    confidence: 'high',
  },
  {
    type: 'SSN',
    regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    confidence: 'high',
  },
  {
    // Luhn-validated credit cards only
    type: 'CREDIT_CARD',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 'high',
    validate: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    },
  },
  {
    // AWS keys, JWTs, Stripe keys, GitHub tokens, generic high-entropy API keys
    // JWT pattern requires 3 dot-separated base64url segments (header.payload.signature)
    type: 'API_KEY',
    regex: /\b(?:AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|sk_(?:live|test)_[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|glpat-[a-zA-Z0-9_-]{20,}|xox[baprs]-[a-zA-Z0-9-]{10,})[a-zA-Z0-9._-]*/g,
    confidence: 'high',
  },
  {
    // Crypto wallet addresses (Bitcoin, Ethereum)
    type: 'CRYPTO_WALLET',
    regex: /\b(?:(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}|0x[a-fA-F0-9]{40})\b/g,
    confidence: 'medium',
  },
  {
    type: 'URL',
    regex: /https?:\/\/[^\s"'<>)]+/g,
    confidence: 'medium',
  },
  {
    // Date of birth / date patterns — only named months or clear date formats
    type: 'DATE',
    regex: /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi,
    confidence: 'medium',
    validate: (m) => !DATE_SUPPRESSION.test(m),
  },
  {
    // US street address (number + street name + type)
    type: 'STREET_ADDRESS',
    regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\.?\b/gi,
    confidence: 'high',
  },
  {
    // City + US state abbreviation (+ optional ZIP) — tightened to require comma or clear separation
    type: 'ADDRESS',
    regex: /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s+\d{5}(?:-\d{4})?)?)\b/g,
    confidence: 'medium',
  },
  {
    // US passport numbers (letter + 8 digits)
    type: 'PASSPORT',
    regex: /\b[A-Z]\d{8}\b/g,
    confidence: 'low',
  },
  {
    // US EIN (Employer Identification Number): XX-XXXXXXX
    type: 'EIN',
    regex: /\b\d{2}-\d{7}\b/g,
    confidence: 'medium',
  },
];

export function detectPII(text: string, options: { detectNames?: boolean } = {}): Match[] {
  const matches: Match[] = [];

  for (const p of DEFAULT_PATTERNS) {
    const rx = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (p.validate && !p.validate(m[0])) continue;
      matches.push({ type: p.type, match: m[0], index: m.index, length: m[0].length, confidence: p.confidence });
    }
  }

  if (options.detectNames) {
    // Capitalized two-word names
    const capRegex = /\b([A-Z][a-z]{1,}\s+[A-Z][a-z]{1,})\b/g;
    let mm: RegExpExecArray | null;
    while ((mm = capRegex.exec(text)) !== null) {
      matches.push({ type: 'NAME', match: mm[0], index: mm.index, length: mm[0].length, confidence: 'low' });
    }
    // Context-triggered names: "my name is ...", "I'm ...", etc.
    // Group 1 = the trigger phrase+space, group 2 = the name — compute index arithmetically
    // so we don't rely on indexOf which is case-sensitive and would fail on mixed-case input.
    const ctxRegex = /((?:my name is|i'm|i am|called|name's)\s+)([a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})?)/gi;
    let mm2: RegExpExecArray | null;
    while ((mm2 = ctxRegex.exec(text)) !== null) {
      const nameMatch = mm2[2];
      const nameIndex = mm2.index + mm2[1].length;
      matches.push({ type: 'NAME', match: nameMatch, index: nameIndex, length: nameMatch.length, confidence: 'medium' });
    }
  }

  // Sort by position, deduplicate overlapping spans
  matches.sort((a, b) => a.index - b.index);
  const deduped: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.index >= cursor) {
      deduped.push(m);
      cursor = m.index + m.length;
    }
  }
  return deduped;
}

export function makePlaceholder(type: string, idx: number, style?: string): string {
  style = style || 'generic';
  if (style === 'numbered') return `[${type}_${idx}]`;
  if (style === 'hashed') return `[${type}_${hashString(String(idx)).slice(0, 6)}]`;
  return `[${type}]`;
}

export function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16);
}

export function redact(text: string, matches: Match[], style = 'generic'): { redacted: string; map: Record<string, string> } {
  let out = '';
  let cursor = 0;
  const map: Record<string, string> = {};
  const counters: Record<string, number> = {};
  for (const m of matches) {
    counters[m.type] = (counters[m.type] || 0) + 1;
    const placeholder = makePlaceholder(m.type, counters[m.type], style);
    // map placeholder → original so the user can see what was replaced, but we never persist this
    map[placeholder] = m.match;
    if (m.index >= cursor) {
      out += text.slice(cursor, m.index) + placeholder;
      cursor = m.index + m.length;
    }
  }
  out += text.slice(cursor);
  return { redacted: out, map };
}
