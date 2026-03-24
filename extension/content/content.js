import { X } from './platforms/twitter.js';
import { REDDIT } from './platforms/reddit.js';
import { INSTAGRAM } from './platforms/instagram.js';

// --- Platform Detection ---

function detectPlatform() {
  const host = window.location.hostname;
  if (host.includes('twitter.com') || host.includes('x.com')) return X;
  if (host.includes('reddit.com')) return REDDIT;
  if (host.includes('instagram.com')) return INSTAGRAM;
  return null;
}

// --- Constants ---

const PLATFORM = detectPlatform();
const CACHE_MAX = 500;

// --- State ---

let settings = null;
let replacementImageUrl = null;           // dataUrl from storage, or null → falls back to default
const classifiedCache = new Map();        // normalizedUrl → predictions[]

// --- Helpers ---

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response.settings);
    });
  });
}

// --- Pre-hide / Reveal / Action ---

function preHide(wrapper) {
  wrapper.dataset.pureFeedState = 'pending';
  wrapper.style.visibility = 'hidden';
}

function reveal(wrapper) {
  wrapper.dataset.pureFeedState = 'clean';
  wrapper.style.visibility = '';
}

function applyAction(wrapper, action) {
  wrapper.style.visibility = '';

  if (action === 'blur') {
    wrapper.dataset.pureFeedState = 'filtered';
    wrapper.style.filter = 'blur(24px)';
    wrapper.style.cursor = 'pointer';
    wrapper.title = 'Filtered by Pure Feed \u2014 click to reveal';
    wrapper.addEventListener('click', () => {
      wrapper.style.filter = '';
      wrapper.style.cursor = '';
      wrapper.title = '';
      wrapper.dataset.pureFeedState = 'revealed';
    }, { once: true });
  } else if (action === 'hide') {
    wrapper.dataset.pureFeedState = 'hidden';
    wrapper.style.display = 'none';
  } else if (action === 'replace') {
    wrapper.dataset.pureFeedState = 'replaced';
    const url = replacementImageUrl || chrome.runtime.getURL('assets/placeholder.png');
    wrapper.querySelectorAll('img').forEach((img) => {
      img.src = url;
    });
  } else if (action === 'delete') {
    wrapper.dataset.pureFeedState = 'deleted';
    // Walk up to the nearest post/article container so the whole post is removed
    const post = wrapper.closest('article') ||
                 wrapper.closest('shreddit-post') ||
                 wrapper.closest('[data-testid="post-container"]') ||
                 wrapper.closest('[data-testid="tweet"]');
    (post || wrapper).remove();
  }
}

// --- Classification ---

function classifyImage(imageUrl) {
  const cacheKey = normalizeUrl(imageUrl);
  if (classifiedCache.has(cacheKey)) {
    return Promise.resolve(classifiedCache.get(cacheKey));
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_IMAGE', imageUrl },
      (result) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        if (result?.success) {
          if (classifiedCache.size >= CACHE_MAX) {
            const oldest = classifiedCache.keys().next().value;
            classifiedCache.delete(oldest);
          }
          classifiedCache.set(cacheKey, result.predictions);
          resolve(result.predictions);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function getFlaggedLabel(predictions) {
  if (!predictions) return null;
  let worst = null;
  let worstProb = 0;
  for (const { className, probability } of predictions) {
    const threshold = settings.thresholds[className];
    if (threshold !== undefined && probability >= threshold && probability > worstProb) {
      worst = className;
      worstProb = probability;
    }
  }
  return worst;
}

// --- Process a single image element ---

async function processImage(img) {
  if (img.tagName === 'VIDEO') return;
  if (!img.src || img.src.startsWith('data:') || img.src.startsWith('blob:')) return;

  const wrapper = img.closest(PLATFORM.mediaWrapper) || img;

  if (wrapper.dataset.pureFeedState) {
    // Already processed — but check if the image URL changed (DOM recycling)
    if (wrapper.dataset.pureFeedLastSrc === normalizeUrl(img.src)) return;
    // URL changed, clear old state and re-process
    wrapper.dataset.pureFeedState = '';
    wrapper.style.filter = '';
    wrapper.style.visibility = '';
    wrapper.style.cursor = '';
    wrapper.title = '';
  }

  // Size check
  if (settings.skipSmallImages) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w > 0 && h > 0 && (w < settings.smallImageThreshold || h < settings.smallImageThreshold)) {
      return;
    }
  }

  wrapper.dataset.pureFeedLastSrc = normalizeUrl(img.src);
  preHide(wrapper);

  const predictions = await classifyImage(img.src);

  if (predictions === null) {
    reveal(wrapper);
    return;
  }

  const flaggedLabel = getFlaggedLabel(predictions);

  try {
    chrome.runtime.sendMessage({
      type: 'RECORD_STAT',
      label: flaggedLabel,
      platformId: PLATFORM.id,
    });
  } catch {
    // Extension context invalidated (e.g. after reload) — ignore
  }

  if (flaggedLabel) {
    applyAction(wrapper, settings.actions[flaggedLabel] || 'blur');
  } else {
    reveal(wrapper);
  }
}

// --- Image handling (shared for observer + initial scan) ---

function handleImage(img) {
  if (img.dataset.pureFeedSeen) return;
  img.dataset.pureFeedSeen = 'true';

  if (img.complete && img.naturalWidth > 0) {
    processImage(img);
  } else {
    img.addEventListener('load', () => processImage(img), { once: true });
    img.addEventListener('error', () => {
      const wrapper = img.closest(PLATFORM.mediaWrapper) || img;
      if (wrapper.dataset.pureFeedState === 'pending') reveal(wrapper);
    }, { once: true });
  }
}

// --- MutationObserver ---

function observeFeed() {
  const observer = new MutationObserver((mutations) => {
    if (!settings?.enabled || !settings.platforms[PLATFORM.id]) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const imgs = node.matches?.(PLATFORM.mediaItem)
          ? [node]
          : [...node.querySelectorAll(PLATFORM.mediaItem)];

        for (const img of imgs) {
          handleImage(img);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Scan images already in the DOM
  document.querySelectorAll(PLATFORM.mediaItem).forEach(handleImage);
}

// --- Init ---

(async () => {
  if (!PLATFORM) return;

  try {
    settings = await getSettings();
  } catch {
    console.error('[PureFeed] Failed to load settings');
    return;
  }

  // Load custom replacement image (stored separately from settings)
  chrome.storage.local.get('replacementImage', ({ replacementImage }) => {
    replacementImageUrl = replacementImage?.dataUrl || null;
  });

  if (!settings.enabled || !settings.platforms[PLATFORM.id]) return;

  observeFeed();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) settings = changes.settings.newValue;
    if ('replacementImage' in changes) {
      replacementImageUrl = changes.replacementImage.newValue?.dataUrl || null;
    }
  });
})();
