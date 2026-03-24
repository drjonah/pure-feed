# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pure Social is a Chrome Extension (Manifest V3) that detects and filters NSFW content from social media feeds using on-device ML. It uses NSFW.js with TensorFlow.js to classify images entirely on the user's device.

## Tech Stack

- **Extension:** Chrome Manifest V3
- **ML:** NSFW.js + TensorFlow.js (MobileNet v2, ~25MB bundled model)
- **Content Scripts:** Vanilla JavaScript
- **UI (Phase 2):** React + Vite (popup, options page)
- **Storage:** chrome.storage.local / chrome.storage.sync

## Architecture

The extension has 4 runtime components communicating via chrome.runtime messaging:

1. **Content Scripts** — Per-platform MutationObserver watches feed DOM for new images, extracts ImageBitmaps, sends to service worker, applies blur/hide/replace actions on results.
2. **Service Worker** — Message router, settings manager, inference queue (max 3 concurrent). Routes classification requests to the offscreen document.
3. **Offscreen Document** — Hosts TensorFlow.js + NSFW.js model. Required because MV3 service workers lack Canvas/DOM APIs needed by TF.js. Provides persistent model context across tab navigations.
4. **Popup UI** — Quick toggle, today's stats, current page status.

Key design: images are pre-hidden before inference completes to prevent NSFW content flash. Results are cached in a URL-keyed LRU cache (max 500, URLs normalized by stripping query params).

## Platform Selectors

Each supported platform has its own selector config module under `content/platforms/`. Phase 1 targets Twitter/X only; Phase 2 adds Reddit, Instagram, Bluesky.

## NSFW.js Classification

5 labels with confidence scores (0-1): Neutral, Drawing, Sexy, Porn, Hentai. User-configurable thresholds determine which labels trigger filtering, and per-label actions (blur/hide/replace).

## Manifest Permissions

`wasm-unsafe-eval` is required in CSP for TensorFlow.js WASM backend — this is a known MV3 constraint, not a security oversight.

## Development Status

The project has comprehensive specs (`docs/project_spec.md`) and Phase 1 task breakdown (`docs/tasks_phase1.md`) but implementation has not started. Follow the 9 Phase 1 tasks sequentially — each builds on the previous.

## Phase 2 Features

- Reddit, Instagram, Bluesky platform support
- React options page with stats (Chart.js, 90-day rolling window)
- Accountable2You (A2U) integration via signal URLs
- LRU inference cache, CSS background-image detection, video frame analysis
