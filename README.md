# Kimi Chat Exporter

Firefox extension to export [Kimi AI](https://kimi.com) conversations as Markdown and JSON.

## Features

- **Export** a conversation as `.md` + `.json` with one click
- **Copy** conversation Markdown to clipboard
- **Batch export** all conversations as a ZIP
- **Toggle** Thinking blocks and Tool calls on/off
- **Format selector** — MD+JSON, MD only, or JSON only
- **Progress bar** during batch export
- **Auto light/dark theme** — adapts to your Firefox theme
- **No external dependencies** — pure vanilla JS

## Install (Users)

> **Option A: Signed release (recommended)**

1. Go to [Releases](https://github.com/conreo/kimi-chat-exporter/releases/latest)
2. Download `kimi-chat-exporter.xpi`
3. Open Firefox → `about:addons` → gear ⚙ → *Install Add-on From File…*
4. Select the `.xpi` file
5. Log into [kimi.com](https://www.kimi.com) — done!

> ⚠️ **Firefox Stable** blocks unsigned extensions. Use **Firefox Developer Edition** or **Nightly**, then set `xpinstall.signatures.required` to `false` in `about:config`.
>
> Or: add your own signature on [addons.mozilla.org](https://addons.mozilla.org/developers/addon/submit/distribution) (free, takes ~24h).

> **Option B: Temporary load (no signing needed)**

1. Clone this repo:
   ```bash
   git clone https://github.com/conreo/kimi-chat-exporter.git
   ```
2. Open Firefox → `about:debugging` → *This Firefox* → *Load Temporary Add-on…*
3. Select `manifest.json` from the cloned folder

> **Option C: Firefox Add-ons (coming soon)**

Pending review on [addons.mozilla.org](https://addons.mozilla.org).

## Usage

1. Log into [kimi.com](https://www.kimi.com)
2. **Right-click** on a chat page → *Export this conversation*
3. Or right-click anywhere on kimi.com → *Export all conversations*
4. Or click the **toolbar icon** for the popup with toggles and copy button

Files save to your Downloads folder.

## Build & Dev

```bash
# Clone
git clone https://github.com/conreo/kimi-chat-exporter.git
cd kimi-chat-exporter

# Run tests
node tests/test.js

# Package .xpi
zip -r kimi-chat-exporter.xpi \
  manifest.json background.html background.js content.js \
  popup.html popup.css popup.js icons/ LICENSE README.md \
  -x ".git/*" ".github/*"

# Load in Firefox
# about:debugging → This Firefox → Load Temporary Add-on → select manifest.json

# Lint with web-ext
npm install -g web-ext
web-ext lint --source-dir .
```

### CI/CD

On push to `main`: validates JS, runs unit tests, lints with web-ext, security scan, packages `.xpi`.  
On release: attaches `.xpi` to the release automatically.

[![Lint, Security & Release](https://github.com/conreo/kimi-chat-exporter/actions/workflows/build.yml/badge.svg)](https://github.com/conreo/kimi-chat-exporter/actions)

## File Structure

```
├── .github/workflows/   # CI/CD pipeline
├── tests/               # Unit tests
├── manifest.json        # MV2 extension manifest
├── background.html      # Background page
├── background.js        # API client, Markdown builder, ZIP creator
├── popup.html           # Toolbar popup UI
├── popup.css            # Styles
├── popup.js             # Popup logic
├── content.js           # Auth token extraction
└── icons/               # Extension icons (16/48/128px)
```

## Kimi API

The extension uses Kimi's internal API with the browser's session token:

- `GET /api/user/v6/chat/list` — paginated conversation list
- `GET /api/user/v6/chat/message/{chat_id}` — conversation messages

No API keys needed — uses your logged-in session from `localStorage`.

## Permissions

| Permission | Reason |
|-----------|--------|
| `storage` | Save format/toggle preferences |
| `downloads` | Save exported files |
| `menus` | Right-click context menu |
| `https://www.kimi.com/*` | API access with browser session |

## License

MIT
