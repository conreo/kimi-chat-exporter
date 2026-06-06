# Kimi Chat Exporter

Firefox extension to export [Kimi AI](https://kimi.com) conversations as Markdown and JSON.

## Features

- **Export** a conversation as `.md` + `.json` with one click
- **Copy** conversation text to clipboard
- **Batch export** all conversations as a ZIP
- **Toggle** Thinking blocks and Tool calls on/off
- **Format selector** — MD+JSON, MD only, or JSON only
- **Progress bar** during batch export
- **Auto light/dark theme** — adapts to your Firefox theme
- **No external dependencies** — pure vanilla JS

## Install

1. Clone this repo
2. Open Firefox → `about:debugging` → This Firefox → Load Temporary Add-on
3. Select `manifest.json`

## Usage

1. Log into [kimi.com](https://www.kimi.com)
2. **Right-click** on a chat page → *Export this conversation*
3. Or right-click anywhere on kimi.com → *Export all conversations*
4. Or click the **toolbar icon** for the popup with toggles

Files save to your Downloads folder.

## File Structure

```
├── manifest.json       # MV2 extension manifest
├── background.html      # Background page
├── background.js        # API client, Markdown builder, ZIP creator
├── popup.html           # Toolbar popup UI
├── popup.css            # Styles
├── popup.js             # Popup logic
├── content.js           # Auth token extraction
└── icons/               # Extension icons (16/48/128px)
```

## Permissions

- `storage` — save format/toggle preferences
- `downloads` — save exported files
- `menus` — right-click context menu
- `https://www.kimi.com/*` — API access with browser session

## License

MIT
