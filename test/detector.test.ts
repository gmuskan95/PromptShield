import { describe, it, expect } from 'vitest';
import { detectPII, redact, makePlaceholder, hashString } from '../src/detector-core';

describe('detector-core', ()=>{
  it('detects email and url', ()=>{
    const text = 'Contact me at alice@example.com or visit https://example.com';
    const matches = detectPII(text);
    const types = matches.map(m=>m.type).sort();
    expect(types).toContain('EMAIL');
    expect(types).toContain('URL');
  });

  it('redacts detected items and returns map', ()=>{
    const text = 'Send to bob@example.com';
    const matches = detectPII(text);
    const { redacted, map } = redact(text, matches, 'numbered');
    expect(redacted).toContain('[EMAIL_1]');
    expect(Object.values(map)[0]).toBe('bob@example.com');
  });

  it('makePlaceholder styles behave', ()=>{
    expect(makePlaceholder('EMAIL',1,'numbered')).toBe('[EMAIL_1]');
    expect(makePlaceholder('EMAIL',2,'generic')).toBe('[EMAIL]');
    const h = makePlaceholder('EMAIL',3,'hashed');
    expect(h.startsWith('[EMAIL_')).toBe(true);
  });

  it('hashString is deterministic', ()=>{
    expect(hashString('123')).toBe(hashString('123'));
  });
});
