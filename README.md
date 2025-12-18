# 🛡️ PromptShield

A privacy-focused browser extension that detects and redacts PII (Personally Identifiable Information) before you send prompts to AI chat services.

## ✨ Features

### Comprehensive PII Detection
- **📧 Email addresses** - john.doe@example.com
- **📱 Phone numbers** - (555) 123-4567, +1-555-123-4567
- **💳 Credit cards** - 4532-1488-0343-6467
- **🔐 SSN** - 123-45-6789
- **🌐 IP addresses** - 192.168.1.1
- **🔑 API keys** - sk_live_abc123, AWS keys, JWT tokens
- **🔗 URLs** - https://example.com
- **📅 Dates/Birthdays** - 15th August, 08/15/2005
- **📍 Addresses** - New York NY 10001
- **🏠 Street addresses** - 123 Main Street
- **👤 Names** (optional) - Detects names with context ("my name is...")

### Smart Detection
- **Context-aware name detection** - Catches names after phrases like "my name is", "I'm", "called"
- **Works on modern chat UIs** - Claude.ai, ChatGPT, Gemini, and more
- **Real-time interception** - Blocks send until you review and approve
- **Flexible redaction styles** - Generic, numbered, or hashed placeholders

## 🚀 Installation

### Development Install

1. **Clone and build:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/PromptShield.git
   cd PromptShield
   npm install
   npm run build
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder

### Configuration

Click the extension icon to configure:
- ✅ **Detect names** - Enable heuristic name detection
- 🎨 **Redaction style** - Choose how PII is replaced
  - Generic: `[EMAIL]`
  - Numbered: `[EMAIL_1]`, `[EMAIL_2]`
  - Hashed: `[EMAIL_a1b2c3]`
- 👁️ **Auto-preview** - Show modal when PII detected

## 🎯 How It Works

1. You type a message in any chat interface
2. Click "Send" or press Cmd/Ctrl+Enter
3. **PromptShield intercepts** if PII is detected
4. **Review modal appears** showing:
   - Original text
   - Redacted version
   - Redaction map
5. Choose your action:
   - ✅ **Send Redacted** - Safe version sent
   - ⚠️ **Send Original** - Keep PII (not recommended)
   - ❌ **Cancel** - Don't send anything

## 🏗️ Architecture

```
src/
├── background.ts        # Service worker
├── contentScript.ts     # Injection & interception logic
├── detector-core.ts     # PII detection patterns
├── detector.ts          # Detector API
└── popup.ts            # Extension popup UI

build.js                # esbuild bundler
manifest.json           # Extension manifest
```

## 🧪 Development

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Project Structure
- Source TypeScript files in `src/`
- Build output in `dist/` (gitignored)
- Uses `esbuild` for fast bundling

## 📝 Future Enhancements

- [ ] Machine learning-based entity detection (NER)
- [ ] Per-site customization and allow-lists
- [ ] Export/import redaction history
- [ ] Support for more PII types (driver's license, passport, etc.)
- [ ] Privacy-preserving analytics

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## 🛠️ Development Tools

Built with assistance from [Claude Code](https://claude.com/claude-code) - an AI-powered development tool.

## 📄 License

MIT License - See LICENSE file for details

## ⚠️ Disclaimer

This is a prototype. While it detects many common PII patterns, it may not catch everything. Always review your prompts before sending sensitive information.
