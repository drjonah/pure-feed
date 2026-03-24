# Phase 1 Claude Code Tasks — NSFW Filter Extension (MVP)

Each task is scoped to a single file or concern. Complete them in order — later tasks depend on earlier ones. Each task includes what to build, why it exists, and exactly how to verify it works.

---

## TASK 1 — Create the project folder structure and `manifest.json` ✅ DONE

### What to build
Create the extension's root directory layout and `manifest.json`. This is the entry point Chrome reads to understand the extension — every other file hangs off it.

```
extension/
├── manifest.json
├── background/
│   └── service-worker.js       ← empty for now
├── offscreen/
│   ├── offscreen.html          ← empty for now
│   └── offscreen.js            ← empty for now
├── content/
│   ├── content.js              ← empty for now
│   └── platforms/
│       └── twitter.js          ← empty for now
├── popup/
│   ├── popup.html              ← empty for now
│   └── popup.js                ← empty for now
├── models/
│   └── .gitkeep
└── assets/
    └── placeholder.png         ← a 1x1 grey PNG is fine for now
```

`manifest.json` contents:
```json
{
  "manifest_version": 3,
  "name": "Pure Feed",
  "version": "0.1.0",
  "description": "Filters NSFW images from social media feeds using on-device ML.",
  "permissions": [
    "storage",
    "offscreen",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "https://twitter.com/*",
    "https://x.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://twitter.com/*", "https://x.com/*"],
      "js": ["content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Pure Feed"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "models/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### How to test
1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `extension/` folder
4. The extension should appear in the list with no errors
5. The icon should appear in the Chrome toolbar (may be a grey puzzle piece if no icon set)
6. There should be **zero** red error banners on the extensions page

**Pass criteria:** Extension loads without errors. Clicking the toolbar icon shows a blank popup (no crash).

### Implementation notes
- All files and directories created as specified.
- `manifest.json` matches the spec exactly (MV3, permissions, CSP with `wasm-unsafe-eval`, web_accessible_resources).
- Placeholder files have stub comments indicating which task implements them (e.g. `// Service worker — implemented in Task 4`).
- `assets/placeholder.png` is a programmatically generated 1x1 grey PNG.
- `.gitignore` added at repo root covering `node_modules/`, model weight binaries, `.DS_Store`, `package-lock.json`.

---

## TASK 2 — Download NSFW.js model weights into `models/` ✅ DONE

### What to build
Download the NSFW.js MobileNet v2 model files and place them in `extension/models/mobilenet/`. These are the pre-trained weights that do the actual image classification. They must be bundled with the extension so inference works offline.

Run these commands from the `extension/` directory:

```bash
mkdir -p models/mobilenet
cd models/mobilenet

# Download model.json and all weight shards from the nsfwjs CDN
curl -O https://raw.githubusercontent.com/infinitered/nsfwjs/master/example/nsfw_demo/public/model/mobilenet_v2/model.json

# The model.json references shard files — download them all
# Check model.json for the exact shard filenames, they look like:
# group1-shard1of4.bin, group1-shard2of4.bin, etc.
# Download each one. Example:
curl -O https://raw.githubusercontent.com/infinitered/nsfwjs/master/example/nsfw_demo/public/model/mobilenet_v2/group1-shard1of4.bin
# ... repeat for all shards listed in model.json
```

Alternatively, use npm to pull the package and copy the model files:
```bash
npm install nsfwjs
cp -r node_modules/nsfwjs/model/* models/mobilenet/
```

Also install the runtime dependencies needed by `offscreen.js`:
```bash
npm install @tensorflow/tfjs nsfwjs
```

Add a `package.json` at the `extension/` root:
```json
{
  "name": "pure-feed-extension",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@tensorflow/tfjs": "^4.x",
    "nsfwjs": "^2.x"
  }
}
```

### How to test
1. Open `extension/models/mobilenet/model.json` — it should be valid JSON with a `weightsManifest` key listing shard filenames
2. Verify every `.bin` file referenced in `model.json` is present in the same folder
3. Check total size: `du -sh extension/models/` — should be roughly 20–30MB
4. In Chrome DevTools console, run:
   ```js
   fetch(chrome.runtime.getURL('models/mobilenet/model.json'))
     .then(r => r.json())
     .then(d => console.log('model.json keys:', Object.keys(d)))
   ```
   from any extension page (popup or offscreen) — should log keys without 404.

**Pass criteria:** All model weight shards present. `model.json` is parseable and references only files that exist.

### Implementation notes
- CDN URLs in the original spec were stale (404s and DNS failures). Model files obtained via sparse clone of the `infinitered/nsfwjs` GitHub repo (`models/mobilenet_v2/` directory).
- Model is the **quantized MobileNet v2** — only 2 files: `model.json` (126K) and `group1-shard1of1` (2.5M). Total ~2.6MB, much smaller than the ~25MB estimate in the spec (that figure likely referred to InceptionV3).
- The shard file has no `.bin` extension — it's named `group1-shard1of1` as referenced in `model.json`. Validated programmatically: all shards in `weightsManifest` are present.
- `package.json` pinned `@tensorflow/tfjs` to `^3.18.0` (not `^4.x`) because `nsfwjs@2.4.2` has a peer dependency on tfjs v3. Using v4 causes `ERESOLVE` errors.
- `npm install` completed successfully. Weight binaries and `node_modules/` are gitignored.

---

## TASK 3 — Build the Offscreen Document (model loader + classifier) ✅ DONE

### What to build
The Offscreen Document is a hidden page Chrome keeps alive in the background. It's the only context in MV3 that has both DOM access (needed by TensorFlow.js) and persistence across tab navigations. This is where the model lives and where all inference runs.

### How to test
1. Load the extension in Chrome
2. Open `chrome://extensions` → click "Service Worker" to open SW DevTools
3. Create the offscreen document manually (Task 4 automates this):
   ```js
   await chrome.offscreen.createDocument({ url: chrome.runtime.getURL('offscreen/offscreen.html'), reasons: ['DOM_SCRAPING'], justification: 'test' });
   ```
4. Go to `chrome://inspect/#other` → click **inspect** next to the offscreen document
5. Console should show `[Offscreen] Model loaded, backend: webgl`

**Pass criteria:** Console shows "Model loaded" with no CSP errors, 404s, or TF.js errors.

### Implementation notes
- **Bundling with esbuild:** Chrome extensions can't resolve bare `node_modules` imports. Added `esbuild` as a dev dependency with `build.mjs` config. `offscreen.js` is bundled to `offscreen/offscreen.bundle.js` (IIFE format, ~4.1MB including TF.js). `offscreen.html` loads the bundle, not the source.
- **CSP fix — `@nsfw-filter/gif-frames` shimmed out:** nsfwjs imports `@nsfw-filter/gif-frames` at the top level, which pulls in `cwise-compiler` — a lib that uses `new Function()`, blocked by MV3 CSP (`unsafe-eval` not allowed). Since we only use `model.classify()` (never `classifyGif()`), the gif-frames module is aliased to an empty stub in `build.mjs`, alongside Node builtin shims (`path`, `stream`, `util`, `assert`, `events`, `zlib`, `buffer`).
- **URL-based classification, not ImageBitmap:** The original spec passed `ImageBitmap` via `chrome.runtime.sendMessage`, but that API doesn't support transferable objects. Instead, the offscreen document receives an `imageUrl` string, fetches the image itself, creates a bitmap via `createImageBitmap()`, draws to `OffscreenCanvas`, and runs `model.classify(canvas)`.
- **Model type is layers, not graph:** The MobileNet v2 model from Task 2 is a Keras/layers model (has `keras_version` in topology), so `nsfwjs.load()` is called without `{ type: 'graph' }`. Default image size is 224.
- **Pending queue:** Messages arriving before model load completes are queued and processed once ready.

---

## TASK 4 — Build the Service Worker (message bus) ✅ DONE

### What to build
The Service Worker is the central coordinator. It:
- Creates and manages the Offscreen Document lifetime
- Routes `CLASSIFY_IMAGE` messages from the content script to the offscreen document
- Returns results back to the content script
- Initializes default settings in `chrome.storage.local` on first install

**`background/service-worker.js`**

```js
// --- Offscreen Document Management ---

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['DOM_SCRAPING'],
    justification: 'TensorFlow.js requires DOM/Canvas API for ML inference',
  });
}

// --- Default Settings ---

const DEFAULT_SETTINGS = {
  enabled: true,
  platforms: { twitter: true },
  thresholds: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  actions: { Sexy: 'blur', Porn: 'blur', Hentai: 'blur' },
  skipSmallImages: true,
  smallImageThreshold: 100,
  checkVideoFrames: true,
  showFilteredCount: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    console.log('[SW] Default settings initialized');
  }
  await ensureOffscreenDocument();
});

// Recreate offscreen doc if SW wakes up after being killed
chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreenDocument();
});

// --- Message Routing ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Content script asks for current settings
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse({ settings: settings || DEFAULT_SETTINGS });
    });
    return true;
  }

  // Content script sends an image bitmap for classification
  if (message.type === 'CLASSIFY_IMAGE') {
    ensureOffscreenDocument().then(() => {
      // Forward to offscreen — must re-send with the transferable bitmap
      chrome.runtime.sendMessage(
        { type: 'CLASSIFY_IMAGE', imageBitmap: message.imageBitmap },
        [message.imageBitmap], // transfer ownership
        (result) => sendResponse(result)
      );
    });
    return true;
  }

  // Popup asks for model status
  if (message.type === 'GET_STATUS') {
    // For now just respond with storage-based status
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse({ enabled: settings?.enabled ?? true, modelReady: true });
    });
    return true;
  }

});
```

### How to test
1. Reload the extension after adding this file
2. Open `chrome://extensions` → click "Service Worker" link to open SW console
3. You should see `[SW] Default settings initialized` on first load
4. Open Chrome DevTools on any page → Console → run:
   ```js
   chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, r => console.log(r));
   ```
   Should log the default settings object
5. Check `chrome.storage.local` is populated:
   - Open SW DevTools → Application tab → Storage → Local Storage → `chrome-extension://[id]`
   - Or in SW console: `chrome.storage.local.get('settings', console.log)`

**Pass criteria:** SW console shows settings initialized. `GET_SETTINGS` message returns the full default settings object. No "offscreen document already exists" errors on reload.

### Implementation notes
- **Protocol deviation from spec:** The spec showed forwarding `ImageBitmap` objects with a transfer array, but `chrome.runtime.sendMessage` doesn't support transferable objects. The `CLASSIFY_IMAGE` handler forwards `imageUrl` strings instead, matching the offscreen document's actual protocol (`offscreen.js` expects `message.imageUrl`).
- **Race condition guard:** `ensureOffscreenDocument()` uses a module-level `creatingPromise` lock to prevent concurrent `createDocument` calls when multiple messages arrive before the offscreen doc exists.
- **Testing note:** `chrome.runtime.sendMessage` from the SW console broadcasts to other extension contexts but not back to the SW's own `onMessage` listener. Test `GET_SETTINGS` from the offscreen doc console (`chrome://inspect/#other`) or verify storage directly with `chrome.storage.local.get('settings').then(console.log)`.

---

## TASK 5 — Build the X platform selector config ✅ DONE

### What to build
Platform configs are isolated modules so selector updates don't require touching core logic. For X.com, define the DOM selectors that identify the feed container, individual media elements, and their wrappers.

**`content/platforms/twitter.js`**

```js
/**
 * Twitter / X platform selectors.
 * data-testid attributes are Twitter's most stable hooks — they're used
 * for their own test suite so they tend to survive redesigns longer than
 * class names.
 *
 * If selectors break after a Twitter update, only this file needs changing.
 */
export const TWITTER = {
  id: 'twitter',

  // The main feed column — scope the MutationObserver here to avoid
  // watching the entire document
  feedContainer: '[data-testid="primaryColumn"]',

  // Individual image and video elements inside tweets
  mediaItem: [
    '[data-testid="tweetPhoto"] img',
    '[data-testid="videoComponent"] video',
    '[data-testid="tweet"] img[src*="pbs.twimg.com"]', // fallback
  ].join(', '),

  // The wrapper div around the media — this is what gets blurred/hidden
  // so layout is preserved
  mediaWrapper: '[data-testid="tweetPhoto"]',

  // Minimum dimensions to bother classifying (skip icons, avatars, etc.)
  minWidth: 100,
  minHeight: 100,
};
```

### How to test
This is a config file with no runtime behavior — validate it by inspection:
1. Open `https://x.com` in Chrome
2. Open DevTools → Console → paste:
   ```js
   document.querySelector('[data-testid="primaryColumn"]') !== null
   ```
   Should return `true`
3. Also verify:
   ```js
   document.querySelectorAll('[data-testid="tweetPhoto"] img').length
   ```
   Returns 0 if no image posts are visible, > 0 if images are in view. Both are valid — the selector is correct either way.

**Pass criteria:** `primaryColumn` selector returns `true`. Image selector returns 0+ (depends on feed content). If `primaryColumn` returns `null`, X has changed their markup — inspect the DOM and update selectors.

### Implementation notes
- **Naming deviation from spec:** Export renamed from `TWITTER` → `X`, id from `'twitter'` → `'x'` to match current platform branding. Filename stays `twitter.js` for consistency with manifest references.
- **Service worker updated:** `DEFAULT_SETTINGS.platforms` key changed from `{ twitter: true }` to `{ x: true }` to match the new id.
- **DOM selectors unchanged:** `data-testid` values like `tweetPhoto` and `tweet` are X's internal attributes — they stay as-is regardless of branding.

---

## TASK 6 — Build the Content Script ✅ DONE

### What to build
The content script runs in the context of the X/Twitter page. It is the heaviest single component in Phase 1. It must:

1. Load settings from the SW on startup
2. Set up a `MutationObserver` to watch for new images entering the feed DOM
3. For each new image: immediately hide it (prevent flash), extract it to an `ImageBitmap`, send it to the SW for classification
4. On receiving results: either reveal the image (clean) or apply the blur action (flagged)
5. Skip images below the size threshold

**`content/content.js`**

```js
import { TWITTER } from './platforms/twitter.js';

// --- State ---
let settings = null;
let pendingImages = new Map(); // imgElement → resolve fn (for pre-hide/reveal)
const PLATFORM = TWITTER;

// --- Helpers ---

function normalizeUrl(url) {
  // Strip query params so CDN auth tokens don't bust the cache
  try { return new URL(url).origin + new URL(url).pathname; }
  catch { return url; }
}

const classifiedCache = new Map(); // normalizedUrl → predictions[]

async function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, ({ settings }) => {
      resolve(settings);
    });
  });
}

// --- Pre-hide: immediately hide image before inference ---

function preHide(img) {
  img.dataset.pureFeedState = 'pending';
  img.style.visibility = 'hidden';
}

function reveal(img) {
  img.dataset.pureFeedState = 'clean';
  img.style.visibility = '';
}

function applyBlur(img) {
  img.dataset.pureFeedState = 'filtered';
  img.style.visibility = '';
  img.style.filter = 'blur(24px)';
  img.style.cursor = 'pointer';
  img.title = 'Filtered by Pure Feed — click to reveal';
  img.addEventListener('click', () => {
    img.style.filter = '';
    img.title = '';
    img.dataset.pureFeedState = 'revealed';
  }, { once: true });
}

// --- Inference ---

async function classifyImage(img) {
  const cacheKey = normalizeUrl(img.src);
  if (classifiedCache.has(cacheKey)) {
    return classifiedCache.get(cacheKey);
  }

  let bitmap;
  try {
    // Fetch image as blob and create ImageBitmap (runs in content script context)
    const response = await fetch(img.src, { mode: 'cors' });
    const blob = await response.blob();
    bitmap = await createImageBitmap(blob);
  } catch {
    // If fetch fails (CORS, etc.), reveal and skip
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_IMAGE', imageBitmap: bitmap },
      [bitmap], // transfer ownership — zero copy
      (result) => {
        if (result?.success) {
          classifiedCache.set(cacheKey, result.predictions);
          resolve(result.predictions);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function isFlagged(predictions) {
  if (!predictions) return false;
  const { thresholds } = settings;
  return predictions.some(({ className, probability }) => {
    const threshold = thresholds[className];
    return threshold !== undefined && probability >= threshold;
  });
}

// --- Process a single image element ---

async function processImage(img) {
  // Skip if already processed or too small
  if (img.dataset.pureFeedState) return;
  if (img.naturalWidth < settings.smallImageThreshold ||
      img.naturalHeight < settings.smallImageThreshold) return;
  if (!img.src || img.src.startsWith('data:')) return;

  preHide(img);

  const predictions = await classifyImage(img);

  if (predictions === null) {
    reveal(img); // couldn't classify — don't punish
    return;
  }

  if (isFlagged(predictions)) {
    applyBlur(img);
  } else {
    reveal(img);
  }
}

// --- MutationObserver ---

function observeFeed() {
  const root = document.querySelector(PLATFORM.feedContainer) || document.body;

  const observer = new MutationObserver((mutations) => {
    if (!settings?.enabled || !settings.platforms[PLATFORM.id]) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the node itself is an img, or contains imgs
        const imgs = node.matches?.('img') ? [node]
          : [...node.querySelectorAll(PLATFORM.mediaItem)];

        for (const img of imgs) {
          if (img.complete && img.naturalWidth > 0) {
            processImage(img);
          } else {
            img.addEventListener('load', () => processImage(img), { once: true });
          }
        }
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  // Also scan images already in the DOM on load
  document.querySelectorAll(PLATFORM.mediaItem).forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      processImage(img);
    } else {
      img.addEventListener('load', () => processImage(img), { once: true });
    }
  });
}

// --- Init ---

(async () => {
  settings = await getSettings();
  if (!settings.enabled || !settings.platforms[PLATFORM.id]) return;
  observeFeed();

  // Re-fetch settings on change (user toggles extension)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) settings = changes.settings.newValue;
  });
})();
```

> **Note for Claude Code:** The content script uses ES module `import` syntax. Since Chrome extensions support ES modules in content scripts only in MV3 with `"type": "module"` in the manifest's content_scripts entry (Chrome 120+), add `"type": "module"` to the content_scripts entry in manifest.json. Alternatively, bundle with esbuild to a single IIFE to avoid module compatibility issues.

### How to test
1. Reload the extension
2. Navigate to `https://x.com`
3. Open DevTools → Console tab
4. Scroll the feed — images should briefly disappear (pre-hide) then reappear
5. To test blur triggering without real NSFW content, temporarily lower thresholds in `chrome.storage.local`:
   ```js
   // Run in SW console to force everything to be flagged
   chrome.storage.local.set({
     settings: {
       ...( await chrome.storage.local.get('settings') ).settings,
       thresholds: { Sexy: 0.0, Porn: 0.0, Hentai: 0.0, Drawing: 0.0 }
     }
   });
   ```
   Then reload x.com — all images should be blurred
6. Click a blurred image — blur should be removed
7. Restore real thresholds after testing

**Pass criteria:** Images pre-hide on load. Clean images reveal normally. Blurred images click-to-reveal works. No uncaught JS errors in the page console.

### Implementation notes
- **Bundled with esbuild:** Content script imports from `./platforms/twitter.js` (ES module), but manifest loads content scripts as classic scripts. Added a second esbuild entry point in `build.mjs` to bundle `content/content.js` → `content/content.bundle.js` (IIFE, ~6.5KB). Manifest updated to load the bundle.
- **URL-based protocol, not ImageBitmap:** The spec showed `ImageBitmap` transfer via `sendMessage`, but that API doesn't support transferable objects. Content script sends `{ type: 'CLASSIFY_IMAGE', imageUrl }` strings instead, matching the SW/offscreen document protocol established in Tasks 3-4.
- **Platform naming:** Uses `import { X }` (not `TWITTER`) and checks `settings.platforms['x']`, matching the Task 5 implementation.
- **Wrapper-based styling:** Blur/hide/replace actions are applied to the `[data-testid="tweetPhoto"]` wrapper (via `img.closest()`), not the `<img>` directly, to preserve layout dimensions.
- **Observes `document.body`** instead of `primaryColumn` to handle X's SPA navigation without needing re-attachment logic.
- **DOM recycling detection:** Tracks `dataset.pureFeedLastSrc` on wrappers to detect when X reuses DOM nodes with different image URLs during virtual scrolling.
- **LRU cache:** URL-keyed Map (max 500 entries) with oldest-first eviction to avoid re-classifying duplicate images.
- **Fail-open:** If classification fails (CORS, network, model error), images are revealed rather than left hidden.

---

## TASK 7 — Build the Popup UI ✅ DONE

### What to build
The popup is what appears when the user clicks the extension icon. Keep it simple for Phase 1: a toggle to enable/disable the extension, a status indicator showing whether the model is loaded, and today's filtered count (just "0" for now, stats come in Phase 2).

**`popup/popup.html`**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      width: 280px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      margin: 0;
      color: #1a1a2e;
      background: #fff;
    }
    h1 { font-size: 16px; margin: 0 0 12px; }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .row:last-child { border-bottom: none; }
    .label { font-weight: 500; }
    .sublabel { font-size: 12px; color: #888; margin-top: 2px; }
    /* Toggle switch */
    .switch { position: relative; width: 40px; height: 22px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #ccc; border-radius: 22px;
      transition: .2s;
    }
    .slider:before {
      content: ""; position: absolute;
      height: 16px; width: 16px; left: 3px; bottom: 3px;
      background: white; border-radius: 50%; transition: .2s;
    }
    input:checked + .slider { background: #4f46e5; }
    input:checked + .slider:before { transform: translateX(18px); }
    .status-dot {
      display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; margin-right: 6px;
    }
    .dot-green { background: #22c55e; }
    .dot-yellow { background: #f59e0b; }
    .stat-num { font-size: 20px; font-weight: 700; color: #4f46e5; }
  </style>
</head>
<body>
  <h1>🛡 Pure Feed</h1>

  <div class="row">
    <div>
      <div class="label">Filter enabled</div>
    </div>
    <label class="switch">
      <input type="checkbox" id="enableToggle">
      <span class="slider"></span>
    </label>
  </div>

  <div class="row">
    <div>
      <div class="label">Model status</div>
    </div>
    <div id="modelStatus">
      <span class="status-dot dot-yellow"></span>Loading…
    </div>
  </div>

  <div class="row">
    <div>
      <div class="label">Filtered today</div>
      <div class="sublabel">across all platforms</div>
    </div>
    <div class="stat-num" id="filteredCount">—</div>
  </div>
</body>
<script src="popup.js"></script>
</html>
```

**`popup/popup.js`**
```js
// Load current settings and update UI
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, ({ settings }) => {
  document.getElementById('enableToggle').checked = settings.enabled;
});

// Load status (model ready check)
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, ({ enabled, modelReady }) => {
  const statusEl = document.getElementById('modelStatus');
  if (modelReady) {
    statusEl.innerHTML = '<span class="status-dot dot-green"></span>Ready';
  } else {
    statusEl.innerHTML = '<span class="status-dot dot-yellow"></span>Loading…';
  }
});

// Filtered count — read from storage
chrome.storage.local.get('stats', ({ stats }) => {
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats?.find(s => s.date === today);
  document.getElementById('filteredCount').textContent = todayStats?.filtered ?? '0';
});

// Toggle handler — write new value to storage
document.getElementById('enableToggle').addEventListener('change', (e) => {
  chrome.storage.local.get('settings', ({ settings }) => {
    const updated = { ...settings, enabled: e.target.checked };
    chrome.storage.local.set({ settings: updated });
  });
});
```

### How to test
1. Reload the extension
2. Click the extension toolbar icon — popup should open
3. Verify the toggle reflects the current `enabled` state (default: on)
4. Toggle it off → close popup → reopen popup → toggle should still be off (persisted)
5. Verify model status shows "Ready" (or "Loading…" briefly on first load)
6. Verify "Filtered today" shows 0 (or a number if you have stats from testing Task 6)
7. Check popup dimensions aren't cut off — it should fit 280px wide cleanly

**Pass criteria:** Popup opens without error. Toggle persists across open/close. No console errors in popup DevTools (right-click popup → Inspect).

### Implementation notes
- Follows spec HTML/CSS closely (280px wide, system font stack, indigo toggle, status dots, stat number).
- Added `chrome.runtime.lastError` checks in `sendMessage` callbacks — spec omitted these, but they prevent silent failures if the SW is unavailable.
- Filtered count reads from `chrome.storage.local.get('stats')` with `?? '0'` fallback. Stats storage doesn't exist yet (Phase 2), so this always shows "0".
- Toggle writes `settings.enabled` to storage. Content script picks up the change via `chrome.storage.onChanged` for new DOM nodes; a page refresh is needed for a full reset of already-processed images.
- No build step or manifest changes needed — `popup.html` was already referenced in `manifest.json` `action.default_popup`.

---

## TASK 8 — Wire up the inference queue in the Service Worker ✅ DONE

### What to build
Right now the SW forwards messages to the offscreen document, but there's no concurrency cap. This task adds a simple queue with a max of 3 concurrent inference calls. Without this, a feed with 20 images sends 20 simultaneous TF.js inference calls which will crash or timeout.

Add the following to `background/service-worker.js`:

```js
// --- Inference Queue ---

const inferenceQueue = [];
let activeInferences = 0;
const MAX_CONCURRENT = 3;

function processQueue() {
  while (activeInferences < MAX_CONCURRENT && inferenceQueue.length > 0) {
    const { imageBitmap, sendResponse } = inferenceQueue.shift();
    activeInferences++;

    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_IMAGE', imageBitmap },
      [imageBitmap],
      (result) => {
        activeInferences--;
        sendResponse(result);
        processQueue(); // check if more items waiting
      }
    );
  }
}

// Replace the CLASSIFY_IMAGE handler in the existing onMessage listener:
if (message.type === 'CLASSIFY_IMAGE') {
  ensureOffscreenDocument().then(() => {
    inferenceQueue.push({ imageBitmap: message.imageBitmap, sendResponse });
    processQueue();
  });
  return true;
}
```

### How to test
1. Reload the extension
2. Navigate to a tweet-heavy X.com page with many images
3. Open SW DevTools → Console
4. Add a temporary log to `processQueue`: `console.log('active:', activeInferences, 'queued:', inferenceQueue.length)`
5. On page load you should see active count spike to 3 and queue drain over a few seconds — never more than 3 active at once
6. No `chrome.runtime.sendMessage` errors about "message port closed"

**Pass criteria:** `activeInferences` never exceeds 3. All queued images eventually process (queue drains to 0). Page performance doesn't noticeably degrade.

### Implementation notes
- Adapted spec from `imageBitmap` with transfer arrays to `imageUrl` strings, matching the protocol established in Tasks 3-6.
- Queue state (`inferenceQueue`, `activeInferences`, `MAX_CONCURRENT = 3`) added as module-level variables in the service worker.
- `processQueue()` drains the queue in a while loop, forwarding to the offscreen document and recursing on each response.
- The `CLASSIFY_IMAGE` handler now pushes to the queue after `ensureOffscreenDocument()` resolves, instead of forwarding directly. Error handling (`.catch()`) preserved.

---

## TASK 9 — End-to-end smoke test checklist ✅ DONE

### What to verify
Run through this manually before considering Phase 1 complete.

**Setup:**
- [ ] Extension loads in Chrome with no errors on `chrome://extensions`
- [ ] Model files present (`du -sh extension/models/` shows ~25MB)
- [ ] Default settings written to storage on install

**Popup:**
- [ ] Opens without errors
- [ ] Toggle starts as "on"
- [ ] Toggling off persists after popup close/reopen
- [ ] Model status shows "Ready" within ~5 seconds of install

**Twitter filtering:**
- [ ] Navigate to `https://x.com` while logged in
- [ ] Images in feed briefly disappear then reappear (pre-hide + reveal cycle visible if you look fast)
- [ ] No red JS errors in page console
- [ ] Force-flag test: set all thresholds to 0.0 in SW console → refresh x.com → all tweet images should be blurred
- [ ] Click a blurred image → blur removed
- [ ] Restore thresholds → refresh → images not blurred

**Kill and recover:**
- [ ] Navigate away and back to x.com — filtering still works (SW woke back up)
- [ ] Disable extension from `chrome://extensions` → x.com images render normally
- [ ] Re-enable → filtering resumes

**Pass criteria:** All checkboxes above pass. Ship Phase 1. Move to `phase2-tasks.md`.