# 🛡️ PromptShield

**Your data stays yours.**

PromptShield is a Chrome extension that catches sensitive personal information in your AI chat messages before you accidentally send it. It intercepts your prompt, highlights what it found, and lets you choose what to hide — all locally, with zero data leaving your browser.

---

## How it works

1. Type a message in any supported AI chat
2. Press Send or Cmd/Ctrl+Enter
3. If PII is detected, PromptShield shows a review modal
4. Click any highlighted item to toggle it on/off
5. Send with redaction, send as-is, or cancel

That's it. No accounts, no servers, no learning from your data.

---

## What it detects

| Type | Example |
|---|---|
| Email | john@example.com |
| Phone | 415-555-1234 |
| Credit card | 4111 1111 1111 1111 (Luhn-validated) |
| SSN | 123-45-6789 |
| IP address | 192.168.1.1 |
| API keys | GitHub PATs, AWS AKIA keys, Stripe keys, JWTs |
| Crypto wallets | Bitcoin, Ethereum addresses |
| Passport numbers | A12345678 |
| URLs | https://example.com |
| Dates | 08/15/1990, 15th August |
| Street addresses | 123 Main Street, New York NY 10001 |
| Names (optional) | Heuristic — "my name is Jane" |

---

## Supported sites

Claude.ai · ChatGPT · Gemini · Perplexity · Copilot · Poe · You.com · HuggingFace · Mistral · LMSYS

---

## Privacy

- **100% local** — all detection runs in your browser via regex patterns
- **No storage of PII** — matches are held in memory only for the duration of the modal
- **No network requests** — the extension never phones home
- **Closed Shadow DOM** — the modal is isolated from page JavaScript so the host site cannot read pill content
- **No learning** — nothing is used to train any model

---

## Installation (Developer)

```bash
git clone https://github.com/gmuskan95/PromptShield.git
cd PromptShield
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` folder

---

## Settings

Click the toolbar icon to access:

- **Site toggle** — enable/disable PromptShield per site instantly
- **Detect names** — heuristic name detection (may have false positives)
- **Redaction style** — how replaced values appear:
  - Generic: `[EMAIL]`
  - Numbered: `[EMAIL_1]`
  - Hashed: `[EMAIL_a3f9c1]`
- **Theme** — Light, Dark, or Auto (follows system)

---

## Architecture

```
src/
├── detector-core.ts   # PII patterns, Luhn validation, confidence scoring
├── contentScript.ts   # Intercept logic, Shadow DOM modal, per-site selectors
├── popup.ts           # Popup + options UI logic
└── background.ts      # Service worker (minimal)

icon.svg               # Source icon — auto-converted to PNG at build time
build.js               # esbuild + sharp bundler
manifest.json          # MV3 manifest, scoped host permissions
```

---

## Development

```bash
npm run build   # compile TypeScript + generate icons → dist/
npm test        # run 44 unit tests (vitest)
```

---

## Redaction styles

Given the input `email me at john@example.com`:

| Style | Output |
|---|---|
| Generic | `email me at [EMAIL]` |
| Numbered | `email me at [EMAIL_1]` |
| Hashed | `email me at [EMAIL_a3f9c1]` |

---

## License

MIT — see LICENSE for details.

---

## Disclaimer

PromptShield catches many common PII patterns but cannot guarantee 100% detection. Always review your prompts before sending sensitive information to any AI service.
