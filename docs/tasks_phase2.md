# Phase 2 Claude Code Tasks — Platform Expansion + Options UI + Stats

Each task is scoped to a single file or concern. Complete them in order — later tasks depend on earlier ones. Each task includes what to build, why it exists, and exactly how to verify it works.

---

## ~~TASK 1 — Add platform selector configs (Reddit, Instagram)~~ ✅

### What to build
Create two new platform config modules following the same pattern as `content/platforms/twitter.js`. Each exports a config object with `id`, `feedContainer`, `mediaItem`, `mediaWrapper`, `minWidth`, and `minHeight`.

**`content/platforms/reddit.js`**
```js
export const REDDIT = {
  id: 'reddit',

  // Main feed or post detail view
  feedContainer: '.ListingLayout-outerContainer, [data-testid="post-container"]',

  // Images inside posts — Reddit uses shreddit-post elements and various image containers
  mediaItem: [
    'shreddit-post img[src*="preview.redd.it"]',
    'shreddit-post img[src*="i.redd.it"]',
    'article img[src*="preview.redd.it"]',
    'article img[src*="i.redd.it"]',
    '[data-testid="post-content"] img',
    'shreddit-post video',
  ].join(', '),

  // Wrapper around media — blur this to preserve layout
  mediaWrapper: '[slot="post-media-container"], [data-testid="post-content"] .media-element',

  minWidth: 100,
  minHeight: 100,
};
```

**`content/platforms/instagram.js`**
```js
export const INSTAGRAM = {
  id: 'instagram',

  // Main feed area
  feedContainer: 'main[role="main"]',

  // Feed post images and videos
  mediaItem: [
    'article img[src*="cdninstagram.com"]',
    'article img[src*="fbcdn.net"]',
    'article video',
  ].join(', '),

  // The image container inside each post
  mediaWrapper: 'article div[role="button"] > div, article div[style*="padding-bottom"]',

  minWidth: 100,
  minHeight: 100,
};
```

### How to test
These are config files — validate by inspection against live DOM:
1. Open each platform in Chrome DevTools
2. Verify `feedContainer` selector returns a non-null element
3. Verify `mediaItem` selector returns 0+ image elements (depends on feed content)
4. Note: selectors may need tuning after testing against real pages — these are starting points based on current DOM structure

**Pass criteria:** Both files created with valid exports. Selectors match the existing pattern from `twitter.js`.

---

## ~~TASK 2 — Multi-platform content script + manifest update~~ ✅

### What to build
Update the content script to detect which platform it's running on and select the correct config. Update the manifest to inject the content script on all supported platforms.

**Changes to `content/content.js`:**
Replace the static `import { X }` with all platform imports, and add hostname-based detection:

```js
import { X } from './platforms/twitter.js';
import { REDDIT } from './platforms/reddit.js';
import { INSTAGRAM } from './platforms/instagram.js';

function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('twitter.com') || host.includes('x.com')) return X;
  if (host.includes('reddit.com')) return REDDIT;
  if (host.includes('instagram.com')) return INSTAGRAM;
  return null;
}

const PLATFORM = detectPlatform();
```

Add a guard at the top of the init IIFE — if `PLATFORM` is null, exit early.

**Changes to `manifest.json`:**

Add new host_permissions:
```json
"host_permissions": [
  "https://twitter.com/*",
  "https://x.com/*",
  "https://www.reddit.com/*",
  "https://www.instagram.com/*"
]
```

Update content_scripts matches:
```json
"content_scripts": [
  {
    "matches": [
      "https://twitter.com/*",
      "https://x.com/*",
      "https://www.reddit.com/*",
      "https://www.instagram.com/*"
    ],
    "js": ["content/content.bundle.js"],
    "run_at": "document_idle"
  }
]
```

**Update `DEFAULT_SETTINGS.platforms` in `background/service-worker.js`:**
```js
platforms: { x: true, reddit: true, instagram: true },
```

**Rebuild:** Run `cd extension && node build.mjs` to regenerate the content bundle.

### How to test
1. Rebuild: `cd extension && node build.mjs`
2. Reload extension in `chrome://extensions`
3. Navigate to each platform — no console errors
4. On X.com: existing filtering still works identically
5. On Reddit/Instagram: content script loads (check with `document.querySelector('[data-pure-feed-seen]')` or watch console for `[PureFeed]` messages)

**Pass criteria:** Content script loads on all 3 platforms without errors. X.com filtering behavior unchanged. Other platforms show pre-hide/reveal cycle on media images (selectors may need tuning for each platform).

---

## ~~TASK 3 — Strictness presets~~ ✅

### What to build
Add a `strictness` setting that applies a named preset of thresholds, making it easy for users to control filtering intensity without tuning individual sliders. Three levels plus a "Custom" mode for manual overrides.

**Preset definitions (add to `background/service-worker.js`):**

```js
const STRICTNESS_PRESETS = {
  relaxed:  { Sexy: 0.9, Porn: 0.8, Hentai: 0.8 },
  moderate: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  strict:   { Sexy: 0.4, Porn: 0.3, Hentai: 0.3, Drawing: 0.7 },
};
```

| Preset | Behavior |
|---|---|
| Relaxed | Only very high-confidence detections. Fewer false positives, may miss borderline content. Drawing not filtered. |
| Moderate | Balanced default. Catches most explicit content with reasonable false positive rate. |
| Strict | Aggressive filtering. Catches more content but expect more false positives (swimwear, art, etc.). |

**Changes to `DEFAULT_SETTINGS` in `background/service-worker.js`:**
- Add `strictness: 'moderate'` to `DEFAULT_SETTINGS`
- Thresholds remain as-is (they match the `moderate` preset)

**Add a `SET_STRICTNESS` message handler in the SW:**

```js
if (message.type === 'SET_STRICTNESS') {
  const preset = STRICTNESS_PRESETS[message.level];
  if (!preset) return;
  chrome.storage.local.get('settings').then(({ settings }) => {
    const updated = {
      ...settings,
      strictness: message.level,
      thresholds: { ...preset },
    };
    chrome.storage.local.set({ settings: updated });
    sendResponse({ success: true });
  });
  return true;
}
```

When users manually change individual thresholds (Task 6 Controls tab), the UI sets `strictness: 'custom'` to indicate the presets no longer apply.

### How to test
1. Reload extension
2. In SW console, send a `SET_STRICTNESS` message:
   ```js
   chrome.runtime.sendMessage({ type: 'SET_STRICTNESS', level: 'strict' }, console.log);
   ```
3. Verify thresholds updated: `chrome.storage.local.get('settings').then(console.log)`
4. Thresholds should match the `strict` preset values
5. Switch to `relaxed` — thresholds update, `Drawing` threshold should not be set
6. Switch to `moderate` — thresholds match defaults

**Pass criteria:** `SET_STRICTNESS` correctly updates both `strictness` and `thresholds` in storage. Content script picks up new thresholds via `chrome.storage.onChanged`.

---

## ~~TASK 4 — Stats tracking in the Service Worker~~ ✅

### What to build
Add DailyStats tracking so the popup and options page can show how many images have been scanned and filtered. Stats are written to `chrome.storage.local` under the `stats` key as an array of daily entries, with a 90-day rolling window.

**Changes to `background/service-worker.js`:**

Add a stats-writing helper:

```js
// --- Stats Tracking ---

async function recordClassification(label, platformId) {
  const today = new Date().toISOString().split('T')[0];
  const { stats = [] } = await chrome.storage.local.get('stats');

  let entry = stats.find(s => s.date === today);
  if (!entry) {
    entry = {
      date: today,
      total: 0,
      filtered: 0,
      byLabel: { Sexy: 0, Porn: 0, Hentai: 0 },
      byPlatform: {},
    };
    stats.push(entry);
  }

  entry.total++;
  if (label) {
    entry.filtered++;
    if (entry.byLabel[label] !== undefined) entry.byLabel[label]++;
    entry.byPlatform[platformId] = (entry.byPlatform[platformId] || 0) + 1;
  }

  // Prune entries older than 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const pruned = stats.filter(s => s.date >= cutoffStr);

  await chrome.storage.local.set({ stats: pruned });
}
```

Update the `CLASSIFY_IMAGE` message handler: after receiving the result from the offscreen document and before calling `sendResponse`, add a `CLASSIFY_RESULT` path. The easiest approach is to have the content script send a separate `RECORD_STAT` message after it determines whether an image was flagged:

Add a new message handler:
```js
if (message.type === 'RECORD_STAT') {
  recordClassification(message.label, message.platformId);
  return false; // no async response needed
}
```

**Changes to `content/content.js`:**

After `processImage` determines the flagged label (or lack thereof), fire a stat recording message:

```js
chrome.runtime.sendMessage({
  type: 'RECORD_STAT',
  label: flaggedLabel, // null if clean
  platformId: PLATFORM.id,
});
```

### How to test
1. Rebuild content script: `cd extension && node build.mjs`
2. Reload extension
3. Browse X.com for a bit (scroll through some images)
4. In SW console: `chrome.storage.local.get('stats').then(console.log)`
5. Should see a stats array with today's date, `total > 0`
6. Force-flag test (thresholds to 0): `filtered` count should increase, `byLabel` should show counts
7. Check popup — "Filtered today" should now show a real number

**Pass criteria:** Stats array is populated in storage after browsing. `total` counts all scanned images. `filtered` and `byLabel` counts only flagged images. Entries older than 90 days would be pruned (hard to test manually).

---

## ~~TASK 5 — Options page scaffold (React + Vite)~~ ✅

### What to build
Set up the React + Vite build pipeline for the options page. This creates the foundation that Tasks 5-7 build on.

**New files:**

`options/src/main.jsx` — React entry point
`options/src/App.jsx` — Tab-based layout (Controls, Stats, About)
`options/src/index.css` — Base styles
`options/index.html` — Vite entry HTML
`options/vite.config.js` — Vite config that builds to `options/dist/`
`options/package.json` — React + Vite + Chart.js dependencies

**`options/vite.config.js`:**
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyDirOnBuild: true,
  },
  base: './',
});
```

**`options/package.json`:**
```json
{
  "name": "pure-feed-options",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^19.x",
    "react-dom": "^19.x",
    "chart.js": "^4.x",
    "react-chartjs-2": "^5.x"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "vite": "^6.x"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

**Manifest update** — add options_page:
```json
"options_page": "options/dist/index.html"
```

**`options/src/App.jsx`:**
```jsx
import { useState } from 'react';
import './index.css';

const TABS = ['Controls', 'Stats', 'About'];

export default function App() {
  const [tab, setTab] = useState('Controls');

  return (
    <div className="container">
      <h1>Pure Feed Settings</h1>
      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={t === tab ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="tab-content">
        {tab === 'Controls' && <div>Controls tab — Task 6</div>}
        {tab === 'Stats' && <div>Stats tab — Task 7</div>}
        {tab === 'About' && <div>About tab — Task 8</div>}
      </div>
    </div>
  );
}
```

### How to test
1. `cd extension/options && npm install && npm run build`
2. Reload extension
3. Right-click extension icon → "Options" (or navigate to `chrome-extension://[id]/options/dist/index.html`)
4. Should see tab-based layout with three placeholder tabs
5. Tabs switch without errors

**Pass criteria:** Options page opens from Chrome. Tab switching works. No console errors. Vite build produces `options/dist/` with `index.html` + JS/CSS assets.

---

## ~~TASK 6 — Controls tab~~ ✅

### What to build
Build the settings controls UI in the Options page. Reads from and writes to `chrome.storage.local`.

**`options/src/Controls.jsx`:**

Components:
- **Global toggle** — `settings.enabled` (same as popup toggle)
- **Per-platform toggles** — `settings.platforms[id]` for each platform (x, reddit, instagram)
- **Strictness selector** — Radio buttons or segmented control: Relaxed / Moderate / Strict. Selecting a preset sends `SET_STRICTNESS` message to SW. Shows "Custom" (disabled, read-only) when user has manually adjusted thresholds.
- **Advanced thresholds** — Expandable/collapsible section. Per-label sliders (`settings.thresholds[label]`) for Sexy, Porn, Hentai, Drawing. Range 0.0–1.0, step 0.05, with live value display. Changing any slider sets `strictness: 'custom'`.
- **Per-label action selector** — `settings.actions[label]` dropdown: blur / hide / replace
- **Small image skip toggle** — `settings.skipSmallImages` + `settings.smallImageThreshold` number input

All controls read initial values from `chrome.storage.local.get('settings')` on mount and write back on change. Use `chrome.storage.onChanged` to keep UI in sync if settings are changed elsewhere (e.g., popup toggle).

### How to test
1. Rebuild: `cd extension/options && npm run build`
2. Reload extension → open Options
3. All controls reflect current storage values
4. Change a threshold slider → verify in SW console: `chrome.storage.local.get('settings').then(console.log)`
5. Change a platform toggle to off → visit that platform → filtering should be inactive
6. Change action from "blur" to "hide" → force-flag test → images should be hidden not blurred

**Pass criteria:** All controls read and write settings correctly. Changes persist across Options page close/reopen. Settings changes are reflected in content script behavior.

---

## ~~TASK 7 — Stats tab with Chart.js visualizations~~ ✅

### What to build
Build the stats visualization tab. Reads from `chrome.storage.local.get('stats')`.

**`options/src/Stats.jsx`:**

Components:
- **Time range selector** — buttons: Last 7 days / 30 days / 90 days (filters the stats array)
- **Line chart** — Images scanned vs. filtered over time (two lines, Chart.js `Line`)
- **Donut chart** — Breakdown by label: Sexy / Porn / Hentai (Chart.js `Doughnut`)
- **Bar chart** — Breakdown by platform (Chart.js `Bar`)
- **Summary cards** — Total filtered, filter rate %, most active platform

Use `react-chartjs-2` for Chart.js React bindings. Register required Chart.js components (CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend).

Handle empty stats gracefully — show "No data yet" placeholder when stats array is empty or all values are zero.

### How to test
1. Generate some stats: browse X.com with the extension enabled, both with normal and force-flagged thresholds
2. Rebuild: `cd extension/options && npm run build`
3. Reload extension → open Options → Stats tab
4. Charts should render with real data
5. Time range buttons should filter the view
6. Summary cards should show accurate numbers

**Pass criteria:** Charts render without errors. Data matches what's in `chrome.storage.local`. Time range filter works. Empty state handled gracefully.

---

## ~~TASK 8 — About tab~~ ✅

### What to build
Build the about/utility tab in the Options page.

**`options/src/About.jsx`:**

Sections:
- **Extension version** — read from `chrome.runtime.getManifest().version`
- **Model info** — "MobileNet v2 (NSFW.js)" static text
- **Export Stats** — button that downloads the stats array as a JSON file (`Blob` + `URL.createObjectURL` + click)
- **Reset Stats** — button with confirmation dialog, clears the `stats` key from storage
- **Reset to Defaults** — button with confirmation dialog, resets `settings` key to `DEFAULT_SETTINGS` (fetch via `GET_SETTINGS` or hardcode)

### How to test
1. Rebuild: `cd extension/options && npm run build`
2. Open Options → About tab
3. Version shows "0.1.0"
4. Click "Export Stats" → JSON file downloads with correct data
5. Click "Reset Stats" → confirm → stats cleared (verify in SW console + Stats tab)
6. Click "Reset to Defaults" → confirm → settings reset (verify in Controls tab + popup)

**Pass criteria:** All three actions work. Confirmations prevent accidental resets. Exported JSON is valid and contains the full stats array.

---

## ~~TASK 9 — End-to-end smoke test~~ ✅

### What to verify
Run through this manually before considering Phase 2 complete.

**Platform support:**
- [ ] Content script loads on X.com, Reddit, Instagram without errors
- [ ] Filtering works on X.com (regression — should be identical to Phase 1)
- [ ] Filtering activates on Reddit (images pre-hide/reveal)
- [ ] Filtering activates on Instagram (images pre-hide/reveal)
- [ ] Per-platform toggle off → that platform's filtering stops

**Strictness presets:**
- [ ] Switching to "Strict" lowers thresholds → more images flagged
- [ ] Switching to "Relaxed" raises thresholds → fewer images flagged
- [ ] Manually adjusting a threshold slider → preset shows "Custom"
- [ ] Selecting a preset again → overrides custom thresholds

**Stats:**
- [ ] Browse with filtering → stats populate in storage
- [ ] Force-flag test → `filtered` and `byLabel` counts increase
- [ ] Popup "Filtered today" shows real count
- [ ] Stats tab charts render with data

**Options page:**
- [ ] Opens from extension context menu → "Options"
- [ ] Controls tab: all settings read/write correctly, strictness selector works
- [ ] Stats tab: charts render, time range filter works
- [ ] About tab: export, reset stats, reset defaults all functional
- [ ] Changes in Options reflected in popup and content script behavior

**Note on selectors:** Platform DOM selectors (Reddit, Instagram) are best-effort starting points. If filtering doesn't activate on a platform, inspect the DOM and update the selector config — this is expected and by design (selectors are isolated in `content/platforms/` for easy updates).

**Pass criteria:** All checkboxes pass. Phase 2 complete.