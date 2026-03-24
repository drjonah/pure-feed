# Project Requirements: Social Media NSFW Filter Chrome Extension

## 1. Overview

A Chrome Extension (Manifest V3) that intercepts media in social media feeds in real-time, classifies it using an on-device ML model (NSFW.js / TensorFlow.js), and suppresses flagged content before or immediately after render. Users configure thresholds and review filter statistics via an Options page.

---

## 2. Architecture

```
┌─────────────────────────────────────────────┐
│              Chrome Extension               │
│                                             │
│  ┌─────────────┐     ┌───────────────────┐  │
│  │   Popup UI  │     │   Options Page    │  │
│  │  (status,   │     │ (settings, stats) │  │
│  │  quick toggle)    │                   │  │
│  └──────┬──────┘     └────────┬──────────┘  │
│         │                     │             │
│  ┌──────▼─────────────────────▼──────────┐  │
│  │         Service Worker (SW)           │  │
│  │  - Lifecycle management               │  │
│  │  - chrome.storage read/write          │  │
│  │  - Stats aggregation                  │  │
│  │  - Message bus between components     │  │
│  └──────────────────┬────────────────────┘  │
│                     │                       │
│  ┌──────────────────▼────────────────────┐  │
│  │     Offscreen Document                │  │
│  │  - Loads NSFW.js + TF.js model        │  │
│  │  - Runs inference on image bitmaps    │  │
│  │  - Model persists for session         │  │
│  └──────────────────┬────────────────────┘  │
│                     │                       │
│  ┌──────────────────▼────────────────────┐  │
│  │        Content Script(s)              │  │
│  │  - MutationObserver on feed DOM       │  │
│  │  - Image/video frame extraction       │  │
│  │  - Blur/hide/replace flagged media    │  │
│  │  - Sends image data → SW → Offscreen  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Why Offscreen Document for Inference?
Service workers cannot access the DOM or Canvas API, which TensorFlow.js requires for image decoding. The Offscreen Document (MV3 API) provides a headless DOM context that persists the loaded model across tab navigations without re-loading 30MB of weights every time.

---

## 3. Technical Stack

| Component | Technology |
|---|---|
| Extension platform | Chrome Manifest V3 |
| ML inference | [NSFW.js](https://github.com/infinitered/nsfwjs) + TensorFlow.js |
| Model format | MobileNet v2 (bundled, ~25MB) or loaded from extension assets |
| Content script | Vanilla JS (no framework, minimize injection overhead) |
| Options/Popup UI | React + Vite (built to static assets) |
| Charts | Chart.js |
| Storage | `chrome.storage.local` (settings + stats) |
| Messaging | `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` |

---

## 4. ML Model & Inference

### 4.1 NSFW.js Classification Labels
The model returns confidence scores (0–1) for 5 classes:

| Class | Description |
|---|---|
| `Neutral` | Safe content |
| `Drawing` | Illustrated/animated content |
| `Sexy` | Suggestive but not explicit |
| `Porn` | Explicit sexual content |
| `Hentai` | Explicit illustrated/animated content |

### 4.2 Inference Pipeline
1. Content script detects new `<img>` or `<video>` element in feed DOM.
2. Image is drawn to an `OffscreenCanvas` in the content script to extract `ImageBitmap`.
3. `ImageBitmap` is transferred (zero-copy via `Transferable`) to the Service Worker via `postMessage`.
4. SW forwards to the Offscreen Document.
5. Offscreen Document runs `nsfwjs.classify(imageBitmap)`.
6. Result (label scores) returned back to content script.
7. Content script applies DOM action based on the result and user thresholds.

### 4.3 Performance Constraints
- **Queue with concurrency cap**: Max 3 concurrent inference calls. Excess images queued with FIFO priority.
- **Result cache**: Hash image `src` URL → LRU cache (max 500 entries) to avoid re-classifying the same CDN image.
- **Video**: Extract 1 frame per video at `currentTime = 0` (thumbnail). Re-check on play if configured.
- **Skip small images**: Ignore images smaller than 100×100px (icons, avatars toggleable in settings).
- **Model load**: Load NSFW.js model once on extension install/startup. Show "model loading" state in popup until ready.

---

## 5. Content Script

### 5.1 Supported Platforms
- X (`twitter.com`, `x.com`)
- Reddit (`reddit.com`)
- Instagram (`instagram.com`)

### 5.2 DOM Observation Strategy
```
MutationObserver → subtree:true, childList:true
  └── Filter for added nodes containing <img> or <video>
      └── Immediately apply placeholder (prevent flash of content)
          └── Queue for inference
              └── On result: remove placeholder or keep hidden
```

**Pre-render suppression**: Before inference completes, apply `visibility: hidden` + a neutral placeholder div with the same dimensions to prevent layout shift. Only reveal if the result is clean.

### 5.3 DOM Actions on Flagged Content

| Action | Behavior |
|---|---|
| `blur` | Apply CSS `filter: blur(24px)` — default |
| `hide` | Set `display: none` on media container |
| `replace` | Swap `src` with a neutral placeholder image |

Action is configurable per class label (e.g., blur `Sexy`, hide `Porn`/`Hentai`).

### 5.4 Platform-Specific Selectors
Each platform requires a selector config module:
```js
// Example: X/Twitter
{
  feedContainer: '[data-testid="primaryColumn"]',
  mediaItem: '[data-testid="tweetPhoto"] img, [data-testid="videoComponent"] video',
  mediaWrapper: '[data-testid="tweetPhoto"]'
}
```
Selectors must be easily updatable as platforms change their DOM — store in a `platforms/` config directory, not hardcoded in the observer loop.

---

## 6. Settings & Configuration

Stored in `chrome.storage.local` under key `settings`. Synced to `chrome.storage.sync` for cross-device portability (within 100KB quota).

```ts
interface Settings {
  enabled: boolean;                          // Global on/off toggle
  strictness: 'relaxed' | 'moderate' | 'strict'; // Preset that sets thresholds, default 'moderate'
  platforms: {
    [platformId: string]: boolean;           // Per-platform toggle
  };
  thresholds: {
    Sexy: number;                            // 0.0–1.0
    Porn: number;                            // 0.0–1.0
    Hentai: number;                          // 0.0–1.0
    Drawing: number;                         // 0.0–1.0
  };
  actions: {
    Sexy: 'blur' | 'hide' | 'replace';
    Porn: 'blur' | 'hide' | 'replace';
    Hentai: 'blur' | 'hide' | 'replace';
  };
  skipSmallImages: boolean;                  // default: true
  smallImageThreshold: number;               // px, default: 100
  checkVideoFrames: boolean;                 // default: true
  showFilteredCount: boolean;               // Overlay badge on filtered items
}
```

### 6.1 Strictness Presets

Selecting a strictness level sets all thresholds at once. Users can still override individual thresholds via advanced controls, which switches the preset to "Custom".

| Preset | Sexy | Porn | Hentai | Drawing | Description |
|---|---|---|---|---|---|
| Relaxed | 0.9 | 0.8 | 0.8 | — | Only very high-confidence detections. Fewer false positives, may miss borderline content. |
| Moderate | 0.7 | 0.5 | 0.5 | 0.9 | Balanced default. Catches most explicit content with reasonable false positive rate. |
| Strict | 0.4 | 0.3 | 0.3 | 0.7 | Aggressive filtering. Catches more content but expect more false positives (swimwear, art, etc.). |

"—" means that label is not filtered at that preset level (threshold not set / effectively 1.0).

---

## 7. Stats & Storage

### 7.1 Stats Schema
```ts
interface DailyStats {
  date: string;               // ISO date "YYYY-MM-DD"
  total: number;              // Total images scanned
  filtered: number;           // Total images filtered
  byLabel: {
    Sexy: number;
    Porn: number;
    Hentai: number;
  };
  byPlatform: {
    [platformId: string]: number;
  };
}
```

Stats are stored as an array of `DailyStats` objects, keyed by date, rolling 90-day window. Older entries are pruned on each write.

### 7.2 Storage Budget
- `chrome.storage.local` limit: 10MB
- Estimated stats size: ~500B per day × 90 days ≈ 45KB — well within budget.
- Model weights are NOT stored in chrome.storage; they ship as extension assets.

---

## 8. Options Page

### 8.1 Sections

**Controls Tab**
- Global enable/disable toggle
- Per-platform enable/disable toggles
- Per-label threshold sliders (Sexy / Porn / Hentai) with live preview value
- Per-label action selector (Blur / Hide / Replace)
- Small image skip toggle + pixel threshold input

**Stats Tab**
- Time range selector: Last 7 days / 30 days / 90 days
- Line chart: Images scanned vs. filtered over time (Chart.js)
- Donut chart: Breakdown by label (Sexy / Porn / Hentai)
- Bar chart: Breakdown by platform
- Summary cards: Total filtered, filter rate %, most active platform

**About Tab**
- Extension version
- Model version
- "Export Stats" (download JSON)
- "Reset Stats" (with confirmation)
- "Reset to Defaults"

### 8.2 Popup (Toolbar Icon Click)
- Compact view (~320×200px)
- On/Off toggle (writes to `settings.enabled`)
- Current page's platform indicator + per-site toggle
- Today's filtered count
- "Open Settings" button → opens Options page

---

## 9. Permissions (manifest.json)

```json
{
  "permissions": [
    "storage",
    "offscreen",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "https://twitter.com/*",
    "https://x.com/*",
    "https://pbs.twimg.com/*",
    "https://www.reddit.com/*",
    "https://preview.redd.it/*",
    "https://external-preview.redd.it/*",
    "https://i.redd.it/*",
    "https://www.instagram.com/*",
    "https://*.cdninstagram.com/*",
    "https://*.fbcdn.net/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

`wasm-unsafe-eval` is required for TensorFlow.js WASM backend. This is a known MV3 requirement for TF.js.

---

## 10. File Structure

```
extension/
├── manifest.json
├── background/
│   └── service-worker.js        # Message routing, stats writes, settings API
├── offscreen/
│   ├── offscreen.html           # Minimal HTML to satisfy Offscreen API
│   └── offscreen.js             # NSFW.js model load + classify()
├── content/
│   ├── content.js               # MutationObserver, image extraction, DOM actions
│   └── platforms/
│       ├── twitter.js
│       ├── reddit.js
│       └── instagram.js
├── popup/
│   ├── popup.html
│   └── popup.js (or React build output)
├── options/
│   ├── options.html
│   └── dist/                    # Vite build output (React + Chart.js)
├── models/
│   └── mobilenet/               # Bundled NSFW.js model weights
│       ├── model.json
│       └── group1-shard*.bin
└── assets/
    └── placeholder.png          # Neutral replacement image
```

---

## 11. Known Constraints & Edge Cases

| Issue | Mitigation |
|---|---|
| X/Instagram lazy-loads media | MutationObserver with `subtree:true` catches dynamic injection |
| Same image reused across tweets | URL-keyed LRU cache skips re-inference |
| CDN URLs include auth tokens (Instagram) | Cache by normalized URL (strip query params) |
| CSS background-image (not `<img>`) | Phase 2: detect via `getComputedStyle`, extract via Canvas |
| Video content (Reels, TikTok-style) | Frame extraction at load; re-check on play event |
| Model not yet loaded on first page load | Queue all detections; process once model ready |
| MV3 Service Worker can be killed | Offscreen document re-created on next message if needed |
| `wasm-unsafe-eval` CSP rejection | Use CPU (plain JS) TF.js backend as fallback |
| False positives (e.g., sunsets, skin) | User can click blurred image to reveal + report; feeds back to threshold UX |

---

## 12. Accountable2You (A2U) Integration

### 12.1 Background

Accountable2You is an accountability software that monitors all network traffic at the OS level (kernel driver on Windows, VPN tunnel on mobile). It captures URLs, page titles, and search terms, then rates items and alerts accountability partners. Its weakness is image content — it cannot classify image binaries, which is the gap this extension fills.

The integration strategy exploits A2U's **Trigger Words** feature: the user pre-registers a custom trigger phrase in A2U (e.g., `nsfwdetected_signal`), then configures the same phrase in the extension. When the extension detects NSFW content, it fires an outbound HTTP request to a URL containing that phrase. A2U intercepts the request at the network layer, pattern-matches the trigger word in the URL, and fires an alert to the accountability partner — **no server infrastructure required**, the request doesn't need to succeed.

### 12.2 How It Works

```
Extension detects NSFW content
    │
    ▼
Construct signal URL:
https://accountability-signal.com/{triggerPhrase}?label=Porn&platform=twitter&ts=1234567890
    │
    ▼
fetch(signalUrl, { mode: 'no-cors', keepalive: true })  ← fire and forget
    │
    ▼
A2U network driver intercepts outbound request
    │
    ▼
A2U matches triggerPhrase → Trigger Word alert → Partner notified
```

`keepalive: true` ensures the request is sent even if the page navigates away mid-flight. `mode: 'no-cors'` prevents CORS errors from surfacing to the extension.

### 12.3 Signal URL Design

```
https://accountability-signal.com/{triggerPhrase}
  ?label={classLabel}         // Porn | Sexy | Hentai
  &platform={platformId}      // twitter | reddit | instagram | bsky
  &count={sessionCount}       // total detections this session
  &ts={unixTimestamp}
```

The base domain (`accountability-signal.com`) can be anything — including `localhost` or a nonexistent domain — since A2U captures the request before DNS resolution. However, using a real domain the user owns or a dedicated static page (e.g., GitHub Pages) is recommended to avoid misleading network error logs in the extension.

**Alternative approach — use A2U's own domain:** Constructing a request to `https://accountable2you.com/{triggerPhrase}` guarantees DNS resolution succeeds and the URL appears cleanly in A2U reports. Trade-off: it looks like the user navigated to accountable2you.com, which may be confusing in reports.

### 12.4 User Setup Flow

1. User opens A2U settings → adds custom Trigger Word (e.g., `nsfwdetected_signal`)
2. User opens extension Options → enables "Report to Accountability Partner" toggle
3. User enters their trigger phrase into the extension settings
4. Extension stores phrase in `chrome.storage.local` under `settings.a2u`
5. On first detection, extension fires a test signal and shows confirmation in Options UI

### 12.5 Settings Schema Addition

```ts
interface Settings {
  // ... existing fields ...
  a2u: {
    enabled: boolean;                    // Toggle: default false
    triggerPhrase: string;               // User-defined, e.g. "nsfwdetected_signal"
    signalDomain: string;                // Default: "accountability-signal.com"
    reportedLabels: {                    // Which labels fire an A2U signal
      Sexy: boolean;                     // default: false (too many false positives)
      Porn: boolean;                     // default: true
      Hentai: boolean;                   // default: true
    };
    debounceSeconds: number;             // Minimum gap between signals, default: 30
                                         // Prevents alert spam from a single page load
  };
}
```

### 12.6 Debounce & Deduplication

Without debouncing, a single Reddit page with 20 images could fire 20 A2U alerts in seconds, which would stress the accountability partner relationship. Rules:

- **Session debounce**: After firing a signal, suppress further signals for `debounceSeconds` (default: 30s).
- **Per-label cooldown**: Track last signal time per label independently — a `Porn` detection during a `Sexy` cooldown still fires.
- **Same URL dedup**: If the same image URL already triggered a signal in this session, skip. Use the same LRU cache as inference results.

### 12.7 Transparency Note

This feature is intentionally transparent by design — consistent with A2U's philosophy. The extension does not attempt to hide the signal request. The URL is human-readable and will appear in A2U reports exactly as constructed. Users should inform their accountability partner that these signals come from the browser extension to avoid confusion.

---

## 14. Phased Delivery (Updated)

### Phase 1 — Core Filter (MVP) ✅ COMPLETE
- [x] MV3 extension scaffold + manifest
- [x] NSFW.js integrated in Offscreen Document
- [x] Content script for X only (MutationObserver + blur action)
- [x] Service Worker message bus + inference queue
- [x] Basic chrome.storage settings (enabled toggle + thresholds)
- [x] Popup with on/off toggle + model status
- [x] LRU cache for inference results
- [x] Click-to-reveal on blurred items

### Phase 2 — Platform Expansion + Options UI + Stats ✅ COMPLETE
- [x] Reddit, Instagram platform selector configs
- [x] Multi-platform content script (runtime platform detection)
- [x] Manifest updates (host_permissions, content_scripts for all platforms)
- [x] Strictness presets (Relaxed / Moderate / Strict) + custom override
- [x] Stats tracking in Service Worker (DailyStats, 90-day rolling window)
- [x] Options page scaffold (React + Vite)
- [x] Controls tab (global toggle, per-platform toggles, strictness selector, per-label action selectors)
- [x] Stats tab (Chart.js line chart, donut chart by label, bar chart by platform, summary cards)
- [x] About tab (version info, export stats JSON, reset stats, reset to defaults)

### Phase 3 — A2U Integration
- [ ] A2U settings schema addition (`settings.a2u`)
- [ ] Signal URL constructor + `fetch()` fire-and-forget in Service Worker
- [ ] Per-label enable/disable for A2U signals
- [ ] Debounce logic (per-label cooldown, same-URL dedup)
- [ ] A2U configuration section in Options UI (toggle, trigger phrase, test signal button)
- [ ] A2U signal count shown in extension stats

### Phase 4 — Polish
- [ ] Cross-device settings sync via `chrome.storage.sync`
- [ ] CSS background-image detection
- [ ] Video frame re-check on play
- [ ] Export stats as JSON
- [ ] Automated selector update mechanism (platform DOM changes)