// Core detector utilities extracted for unit testing
export type Match = { type: string; match: string; index: number; length: number };

const DEFAULT_PATTERNS = [
  {type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g},
  {type: 'PHONE', regex: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])?\d{3,4}[ .-]?\d{3,4}/g},
  {type: 'IP_ADDRESS', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g},
  {type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g},
  {type: 'CREDIT_CARD', regex: /\b(?:\d[ -]*?){13,19}\b/g},
  {type: 'API_KEY', regex: /\b(?:sk_live|sk_test|api_key|AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]{10,})[a-zA-Z0-9._-]*\b/g},
  {type: 'URL', regex: /https?:\/\/[^\s]+/g},
  // Date of birth / date patterns (MM/DD/YYYY, DD-MM-YYYY, Month DD YYYY, DDth Month, etc.)
  {type: 'DATE', regex: /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi},
  // US Address patterns (City, State or City State ZIP)
  {type: 'ADDRESS', regex: /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:\s+\d{5}(?:-\d{4})?)?)\b/g},
  // Street address pattern (number + street name)
  {type: 'STREET_ADDRESS', regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl)\b/gi}
];

export function detectPII(text: string, options: { detectNames?: boolean } = {}): Match[]{
  const patterns = DEFAULT_PATTERNS as Array<{type:string,regex:RegExp}>;
  const matches: Match[] = [];
  patterns.forEach(p=>{
    let m: RegExpExecArray | null;
    const rx = new RegExp(p.regex.source, p.regex.flags);
    while((m = rx.exec(text)) !== null){
      matches.push({type: p.type, match: m[0], index: m.index, length: m[0].length});
    }
  });

  if(options.detectNames){
    // Match properly capitalized names (original pattern)
    const nameRegexCapitalized = /\b([A-Z][a-z]{1,}\s+[A-Z][a-z]{1,})(?:\b|$)/g;
    let mm: RegExpExecArray | null;
    while((mm = nameRegexCapitalized.exec(text)) !== null){
      matches.push({type: 'NAME', match: mm[0], index: mm.index, length: mm[0].length});
    }

    // Also catch names after common patterns like "my name is", "I'm", "called", etc.
    const nameContextRegex = /(?:my name is|i'm|i am|called|name's)\s+([a-z]{2,}\s+[a-z]{2,})/gi;
    let mm2: RegExpExecArray | null;
    while((mm2 = nameContextRegex.exec(text)) !== null){
      // Extract just the name part (group 1)
      const nameMatch = mm2[1];
      const nameIndex = mm2.index + mm2[0].indexOf(nameMatch);
      matches.push({type: 'NAME', match: nameMatch, index: nameIndex, length: nameMatch.length});
    }
  }

  matches.sort((a,b)=>a.index-b.index);
  const uniq: Match[] = [];
  const seen = new Set<string>();
  matches.forEach(m=>{
    const key = `${m.index}|${m.length}`;
    if(!seen.has(key)){ seen.add(key); uniq.push(m); }
  });
  return uniq;
}

export function makePlaceholder(type: string, idx: number, style?: string){
  style = style || 'generic';
  if(style === 'numbered') return `[${type}_${idx}]`;
  if(style === 'hashed') return `[${type}_${hashString(String(idx)).slice(0,6)}]`;
  return `[${type}]`;
}

export function hashString(s: string){
  let h = 2166136261;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
  }
  return (h>>>0).toString(16);
}

export function redact(text: string, matches: Match[], style='generic'){
  let out = '';
  let cursor = 0;
  const map: Record<string,string> = {};
  let counters: Record<string,number> = {};
  matches.forEach(m=>{
    counters[m.type] = (counters[m.type]||0)+1;
    const placeholder = makePlaceholder(m.type, counters[m.type], style);
    map[placeholder] = m.match;
    if(m.index >= cursor){
      out += text.slice(cursor, m.index) + placeholder;
      cursor = m.index + m.length;
    }
  });
  out += text.slice(cursor);
  return { redacted: out, map };
}
