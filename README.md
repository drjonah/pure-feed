# Pure Feed

A Chrome extension that filters NSFW content from social media feeds using on-device machine learning. All classification happens locally — no images ever leave your browser.

**Supported platforms:** X, Reddit, Instagram

## Install

### 1. Download

Go to the [Releases page](../../releases/latest) and download `pure-feed-v*.zip`.

### 2. Extract

Unzip the downloaded file. You'll get a folder with the extension files.

### 3. Load in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the extracted folder

### 4. Pin the extension

Click the puzzle piece icon in Chrome's toolbar, then pin **Pure Feed** for quick access.

## Usage

- **Click the extension icon** to see the popup with a quick toggle, model status, and today's filtered count
- **Click "Settings"** in the popup to open the full options page with:
  - **Controls** — Per-platform toggles, strictness presets, threshold sliders, action selectors
  - **Stats** — Charts showing images scanned/filtered over time, by label, and by platform
  - **About** — Version info, export/reset data

## How it works

Pure Feed uses [NSFW.js](https://github.com/infinitered/nsfwjs) (MobileNet v2) running entirely in your browser via TensorFlow.js. When you scroll through your feed:

1. New images are detected via a MutationObserver
2. Images are pre-hidden to prevent NSFW content from flashing
3. Each image is classified into 5 categories: Neutral, Drawing, Sexy, Porn, Hentai
4. Based on your configured thresholds, flagged images are blurred, hidden, or replaced
5. Clean images are revealed normally

No data is sent to any server. The ML model (~2.5MB) ships with the extension.

## Development

Requires Node.js. First-time setup:

```bash
cd extension
npm run setup
```

After making changes, rebuild:

```bash
cd extension
npm run build
```

To package a release zip:

```bash
cd extension
npm run package
```

Then reload the extension in `chrome://extensions`.

## Tech stack

- Chrome Manifest V3
- TensorFlow.js + NSFW.js (MobileNet v2)
- React + Vite (options page)
- Chart.js (stats visualizations)
- Vanilla JS (content scripts)
