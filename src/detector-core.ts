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
    // Luhn-validated credit cards only — must run before PHONE so 16-digit card numbers
    // aren't partially consumed by the phone heuristic first
    type: 'CREDIT_CARD',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 'high',
    validate: (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    },
  },
  {
    // Require at least 10 digits total to avoid short number false positives.
    // If a +country code is present, validate it's a real ITU prefix (1-3 digits,
    // not 000/999 or other unused ranges).
    type: 'PHONE',
    regex: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])?\d{3,4}[\s.-]?\d{4}/g,
    confidence: 'medium',
    validate: (m) => {
      if (m.replace(/\D/g, '').length < 10) return false;
      const ccMatch = m.match(/^\+(\d{1,3})/);
      if (ccMatch) {
        const cc = parseInt(ccMatch[1], 10);
        // ITU-T E.164: valid country codes are 1–999 excluding known unassigned ranges
        if (cc === 0 || cc > 999) return false;
        // Reject obviously fake prefixes: 000, 999, and 8xx reserved ranges
        if (cc === 0 || (cc >= 800 && cc <= 809) || cc === 999) return false;
      }
      return true;
    },
  },
  {
    // Prefix-based API key detection — each provider intentionally uses a
    // distinctive prefix so secret scanners (and we) can catch them precisely.
    // Covers: AWS, JWT, Anthropic, OpenAI, Stripe, GitHub, GitLab, Slack,
    //         Hugging Face, Replicate, Google, Pinecone, LinkedIn, SendGrid,
    //         Mailgun, Twilio, generic api_/apr_ prefixes.
    type: 'API_KEY',
    regex: /\b(?:AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}|sk-ant-(?:api03-)?[a-zA-Z0-9_-]{20,}|sk[-_](?:proj-|live_|test_)?[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|glpat-[a-zA-Z0-9_-]{20,}|xox[baprs]-[a-zA-Z0-9-]{10,}|hf_[a-zA-Z0-9]{30,}|r8_[a-zA-Z0-9]{36}|AIza[a-zA-Z0-9_-]{35}|pcsk_[a-zA-Z0-9_]{40,}|pat-na[0-9]-[a-zA-Z0-9_-]{40,}|SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}|key-[a-zA-Z0-9]{32}|AC[a-zA-Z0-9]{32}|SK[a-zA-Z0-9]{32}|ap[ir]_[a-zA-Z0-9_-]{30,})[a-zA-Z0-9._-]*/g,
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

  // Pre-compute URL path spans so we can:
  //   1. Skip random-looking strings inside URL paths (e.g. Google Doc IDs)
  //   2. BUT still flag UUIDs inside URL paths — those are real identifiers
  //   3. NOT skip query string params — ?api_key=sk_live_... must still be detected
  const urlPathOnlySpans: Array<[number, number]> = []; // path only, excludes query/fragment
  {
    const urlRx = /https?:\/\/[^\s]+/g;
    let um: RegExpExecArray | null;
    while ((um = urlRx.exec(text)) !== null) {
      const afterProto = um[0].indexOf('://') + 3;
      const pathStart = um[0].indexOf('/', afterProto);
      if (pathStart === -1) continue;
      // Path ends at ? or # — query string and fragment are NOT suppressed
      const queryStart = um[0].indexOf('?', pathStart);
      const fragStart = um[0].indexOf('#', pathStart);
      const pathEnd = queryStart !== -1 ? queryStart : fragStart !== -1 ? fragStart : um[0].length;
      urlPathOnlySpans.push([um.index + pathStart, um.index + pathEnd]);
    }
  }
  function insideUrlPath(index: number, length: number): boolean {
    return urlPathOnlySpans.some(([s, e]) => index >= s && index + length <= e);
  }

  // Detect UUIDs inside URL paths — flag them so they get redacted while
  // the rest of the URL stays intact.
  {
    const uuidRx = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
    let um: RegExpExecArray | null;
    while ((um = uuidRx.exec(text)) !== null) {
      if (insideUrlPath(um.index, um[0].length)) {
        matches.push({ type: 'UUID', match: um[0], index: um.index, length: um[0].length, confidence: 'high' });
      }
    }
  }

  // Also detect standalone UUIDs outside URLs
  {
    const uuidRx = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
    let um: RegExpExecArray | null;
    while ((um = uuidRx.exec(text)) !== null) {
      if (!insideUrlPath(um.index, um[0].length)) {
        matches.push({ type: 'UUID', match: um[0], index: um.index, length: um[0].length, confidence: 'medium' });
      }
    }
  }

  for (const p of DEFAULT_PATTERNS) {
    const rx = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (p.validate && !p.validate(m[0])) continue;
      if (insideUrlPath(m.index, m[0].length)) continue;
      matches.push({ type: p.type, match: m[0], index: m.index, length: m[0].length, confidence: p.confidence });
    }
  }

  if (options.detectNames) {
    // Common English words that should never be treated as names
    const STOPWORDS = new Set([
      'working','trying','going','doing','using','looking','getting','having','making',
      'taking','coming','being','seeing','saying','thinking','knowing','feeling','showing',
      'letting','telling','asking','giving','helping','finding','leaving','sending',
      'meeting','building','running','writing','reading','playing','moving','starting',
      'talking','waiting','calling','setting','turning','hearing','keeping','putting',
      'thank','thanks','hello','please','sorry','great','good','well','just','also',
      'very','really','actually','already','still','even','back','here','there','then',
      'your','their','about','after','before','between','through','during','without',
      'against','myself','yourself','himself','herself','itself','ourselves','themselves',
      'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
      'january','february','march','april','june','july','august','september',
      'october','november','december',
      // Tech terms that appear capitalized but are never names
      'python','pandas','numpy','react','angular','vue','svelte','django','flask',
      'fastapi','express','nextjs','nodejs','typescript','javascript','golang',
      'kubernetes','docker','terraform','ansible','jenkins','github','gitlab',
      'postgres','mongodb','mysql','redis','elasticsearch','kafka','rabbitmq',
      'aws','gcp','azure','lambda','cloudfront','dynamodb','firebase','supabase',
      'openai','anthropic','gemini','mistral','ollama','langchain','llamaindex',
      'linux','ubuntu','debian','windows','macos','android','ios',
      'chrome','firefox','safari','webpack','vite','eslint','prettier',
      'dashboard','overview','summary','report','analysis','results','output',
      'settings','config','configure','setup','install','deploy','release',
      'version','update','upgrade','migration','refactor','feature','bugfix',
      'alpha','beta','gamma','delta','sigma','omega',
      'project','module','service','component','interface','abstract','default',
      'public','private','static','async','await','import','export',
    ]);

    function isLikelyName(word: string): boolean {
      return !STOPWORDS.has(word.toLowerCase());
    }

    // Capitalized two-word names
    const capRegex = /\b([A-Z][a-z]{1,}\s+[A-Z][a-z]{1,})\b/g;
    let mm: RegExpExecArray | null;
    while ((mm = capRegex.exec(text)) !== null) {
      const words = mm[0].split(/\s+/);
      if (words.every(isLikelyName)) {
        matches.push({ type: 'NAME', match: mm[0], index: mm.index, length: mm[0].length, confidence: 'low' });
      }
    }
    // Context-triggered names: "my name is ...", "I'm ...", etc.
    // Group 1 = the trigger phrase+space, group 2 = the name — compute index arithmetically
    // so we don't rely on indexOf which is case-sensitive and would fail on mixed-case input.
    const ctxRegex = /((?:my name is|i'm|i am|called|name's)\s+)([a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})?)/gi;
    let mm2: RegExpExecArray | null;
    while ((mm2 = ctxRegex.exec(text)) !== null) {
      const nameMatch = mm2[2];
      const nameIndex = mm2.index + mm2[1].length;
      const words = nameMatch.split(/\s+/);
      if (words.every(isLikelyName)) {
        matches.push({ type: 'NAME', match: nameMatch, index: nameIndex, length: nameMatch.length, confidence: 'medium' });
      }
    }
  }

  // Context-triggered high-entropy token detection — catches generic API keys,
  // tokens, secrets, and passwords that follow a context keyword.
  // We require: keyword → optional separator (=, :, space) → token 20+ chars
  // with at least 3 distinct character classes (upper, lower, digit, symbol).
  {
    // Separator: = : " space, OR the word "is"/"was"/":" with surrounding spaces
    const ctxKeyRx = /\b(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token|auth[_-]?token|bearer|secret[_-]?key|secret|private[_-]?key|password|passwd|token|authorization|credential)\s*(?:[=:"']|\bis\b|\bwas\b)?\s*([a-zA-Z0-9+/=_\-\.!@#$%^&*]{20,})/gi;
    let km: RegExpExecArray | null;
    while ((km = ctxKeyRx.exec(text)) !== null) {
      const token = km[1];
      const tokenIndex = km.index + km[0].length - token.length;
      // Count character classes present
      let classes = 0;
      if (/[a-z]/.test(token)) classes++;
      if (/[A-Z]/.test(token)) classes++;
      if (/[0-9]/.test(token)) classes++;
      if (/[^a-zA-Z0-9]/.test(token)) classes++; // any symbol counts
      if (classes < 3) continue;
      // Skip if already covered by a prefix-based match
      const alreadyCovered = matches.some(
        m => m.type === 'API_KEY' && m.index <= tokenIndex && tokenIndex < m.index + m.length
      );
      if (alreadyCovered) continue;
      matches.push({ type: 'API_KEY', match: token, index: tokenIndex, length: token.length, confidence: 'medium' });
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
