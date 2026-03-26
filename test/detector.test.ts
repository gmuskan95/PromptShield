import { describe, it, expect } from 'vitest';
import { detectPII, redact, makePlaceholder, hashString } from '../src/detector-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function types(text: string, opts = {}) {
  return detectPII(text, opts).map(m => m.type);
}

// ---------------------------------------------------------------------------
// EMAIL
// ---------------------------------------------------------------------------
describe('EMAIL', () => {
  it('detects a standard email', () => {
    expect(types('Contact alice@example.com today')).toContain('EMAIL');
  });
  it('detects email with subdomains', () => {
    expect(types('bob@mail.corp.example.co.uk')).toContain('EMAIL');
  });
  it('does not flag plain text without @', () => {
    expect(types('hello world')).not.toContain('EMAIL');
  });
});

// ---------------------------------------------------------------------------
// PHONE
// ---------------------------------------------------------------------------
describe('PHONE', () => {
  it('detects a US phone number', () => {
    expect(types('Call me at 415-555-1234')).toContain('PHONE');
  });
  it('detects international format', () => {
    expect(types('reach me at +44 20 7946 0958')).toContain('PHONE');
  });
  it('does not flag a 5-digit zip code as a phone', () => {
    expect(types('ZIP code 94103')).not.toContain('PHONE');
  });
});

// ---------------------------------------------------------------------------
// SSN
// ---------------------------------------------------------------------------
describe('SSN', () => {
  it('detects a valid SSN', () => {
    expect(types('SSN: 123-45-6789')).toContain('SSN');
  });
  it('does not flag the invalid 000 prefix', () => {
    expect(types('000-45-6789')).not.toContain('SSN');
  });
  it('does not flag 666 prefix', () => {
    expect(types('666-45-6789')).not.toContain('SSN');
  });
  it('does not flag 900+ prefix', () => {
    expect(types('987-65-4321')).not.toContain('SSN');
  });
});

// ---------------------------------------------------------------------------
// CREDIT_CARD (with Luhn)
// ---------------------------------------------------------------------------
describe('CREDIT_CARD', () => {
  it('detects a Luhn-valid Visa test number', () => {
    expect(types('Card: 4111111111111111')).toContain('CREDIT_CARD');
  });
  it('detects a Luhn-valid Mastercard test number', () => {
    expect(types('5500005555555559')).toContain('CREDIT_CARD');
  });
  it('does NOT flag a Luhn-invalid number', () => {
    expect(types('1234567890123456')).not.toContain('CREDIT_CARD');
  });
  it('does NOT flag a short product ID', () => {
    expect(types('SKU 123456789')).not.toContain('CREDIT_CARD');
  });
});

// ---------------------------------------------------------------------------
// IP_ADDRESS
// ---------------------------------------------------------------------------
describe('IP_ADDRESS', () => {
  it('detects a valid IPv4', () => {
    expect(types('server at 192.168.1.100')).toContain('IP_ADDRESS');
  });
  it('does not flag 999.x.x.x as IP', () => {
    expect(types('999.999.999.999')).not.toContain('IP_ADDRESS');
  });
});

// ---------------------------------------------------------------------------
// API_KEY
// ---------------------------------------------------------------------------
describe('API_KEY', () => {
  it('detects an AWS AKIA key', () => {
    expect(types('key=AKIAIOSFODNN7EXAMPLE')).toContain('API_KEY');
  });
  it('detects a Stripe live key', () => {
    expect(types('sk_li''+'ve_abcdefghijklmnopqrstuvwx')).toContain('API_KEY');
  });
  it('detects a GitHub PAT', () => {
    expect(types('token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789')).toContain('API_KEY');
  });
});

// ---------------------------------------------------------------------------
// CRYPTO_WALLET
// ---------------------------------------------------------------------------
describe('CRYPTO_WALLET', () => {
  it('detects an Ethereum address', () => {
    expect(types('send to 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12')).toContain('CRYPTO_WALLET');
  });
  it('detects a Bitcoin legacy address', () => {
    expect(types('btc: 1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf Na')).toContain('CRYPTO_WALLET');
  });
});

// ---------------------------------------------------------------------------
// DATE
// ---------------------------------------------------------------------------
describe('DATE', () => {
  it('detects a named-month date', () => {
    expect(types('born January 15 1990')).toContain('DATE');
  });
  it('detects a numeric date', () => {
    expect(types('dob 12/31/1985')).toContain('DATE');
  });
  it('does not flag a semver version as a date', () => {
    expect(types('version 1.2.3')).not.toContain('DATE');
  });
});

// ---------------------------------------------------------------------------
// ADDRESS / STREET_ADDRESS
// ---------------------------------------------------------------------------
describe('STREET_ADDRESS', () => {
  it('detects a US street address', () => {
    expect(types('I live at 123 Main Street')).toContain('STREET_ADDRESS');
  });
  it('detects abbreviated street type', () => {
    expect(types('450 Elm Ave is my address')).toContain('STREET_ADDRESS');
  });
});

describe('ADDRESS', () => {
  it('detects city, state', () => {
    expect(types('from San Francisco, CA 94103')).toContain('ADDRESS');
  });
  it('does not flag bare state abbreviations', () => {
    expect(types('I am in CA for the week')).not.toContain('ADDRESS');
  });
});

// ---------------------------------------------------------------------------
// PASSPORT / EIN
// ---------------------------------------------------------------------------
describe('PASSPORT', () => {
  it('detects a US-style passport number', () => {
    expect(types('passport A12345678')).toContain('PASSPORT');
  });
});

describe('EIN', () => {
  it('detects an EIN', () => {
    expect(types('EIN: 12-3456789')).toContain('EIN');
  });
});

// ---------------------------------------------------------------------------
// NAME detection (opt-in)
// ---------------------------------------------------------------------------
describe('NAME', () => {
  it('detects a capitalised two-word name', () => {
    expect(types('My colleague John Smith reviewed it', { detectNames: true })).toContain('NAME');
  });
  it('detects name after "my name is"', () => {
    expect(types('my name is alice jones', { detectNames: true })).toContain('NAME');
  });
  it('does not detect names when option is off', () => {
    expect(types('John Smith sent the report', { detectNames: false })).not.toContain('NAME');
  });
});

// ---------------------------------------------------------------------------
// redact()
// ---------------------------------------------------------------------------
describe('redact()', () => {
  it('replaces PII with placeholder and builds map', () => {
    const text = 'Send to bob@example.com';
    const matches = detectPII(text);
    const { redacted, map } = redact(text, matches, 'numbered');
    expect(redacted).toContain('[EMAIL_1]');
    expect(Object.values(map)[0]).toBe('bob@example.com');
  });

  it('map does not persist between calls (no shared state)', () => {
    const { map: m1 } = redact('a@b.com', detectPII('a@b.com'), 'numbered');
    const { map: m2 } = redact('c@d.com', detectPII('c@d.com'), 'numbered');
    expect(Object.values(m1)[0]).toBe('a@b.com');
    expect(Object.values(m2)[0]).toBe('c@d.com');
  });

  it('handles overlapping patterns without duplicating output', () => {
    const text = 'Visit https://alice@secret.com/path';
    const matches = detectPII(text);
    const { redacted } = redact(text, matches, 'generic');
    // Should not contain the original email/url twice
    expect(redacted).not.toContain('alice@secret.com');
  });
});

// ---------------------------------------------------------------------------
// makePlaceholder / hashString
// ---------------------------------------------------------------------------
describe('makePlaceholder', () => {
  it('generic style', () => expect(makePlaceholder('EMAIL', 1, 'generic')).toBe('[EMAIL]'));
  it('numbered style', () => expect(makePlaceholder('EMAIL', 1, 'numbered')).toBe('[EMAIL_1]'));
  it('hashed style starts correctly', () => expect(makePlaceholder('EMAIL', 3, 'hashed')).toMatch(/^\[EMAIL_[0-9a-f]+\]$/));
});

describe('hashString', () => {
  it('is deterministic', () => expect(hashString('abc')).toBe(hashString('abc')));
  it('differs for different inputs', () => expect(hashString('abc')).not.toBe(hashString('xyz')));
});

// ---------------------------------------------------------------------------
// confidence field
// ---------------------------------------------------------------------------
describe('confidence field', () => {
  it('email has high confidence', () => {
    const m = detectPII('x@y.com').find(m => m.type === 'EMAIL');
    expect(m?.confidence).toBe('high');
  });
  it('SSN has high confidence', () => {
    const m = detectPII('123-45-6789').find(m => m.type === 'SSN');
    expect(m?.confidence).toBe('high');
  });
  it('valid credit card has high confidence', () => {
    const m = detectPII('4111111111111111').find(m => m.type === 'CREDIT_CARD');
    expect(m?.confidence).toBe('high');
  });
});
