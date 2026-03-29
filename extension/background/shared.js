// Shared background logic — used by both Chrome service-worker.js and Firefox background.js

// --- Default Settings ---

export const DEFAULT_SETTINGS = {
  enabled: true,
  strictness: 'moderate',
  platforms: { x: true, reddit: true, instagram: true },
  thresholds: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  actions: { Sexy: 'blur', Porn: 'blur', Hentai: 'blur' },
  skipSmallImages: true,
  smallImageThreshold: 100,
  checkVideoFrames: true,
  showFilteredCount: true,
  textFilterEnabled: false,
  textFilterCustomWords: [],
};

// --- Strictness Presets ---

export const STRICTNESS_PRESETS = {
  relaxed:  { Sexy: 0.9, Porn: 0.8, Hentai: 0.8 },
  moderate: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  strict:   { Sexy: 0.4, Porn: 0.3, Hentai: 0.3, Drawing: 0.7 },
};

// --- Stats Tracking ---

export async function recordClassification(label, platformId, source) {
  const today = new Date().toISOString().split('T')[0];
  const { stats = [] } = await chrome.storage.local.get('stats');

  let entry = stats.find(s => s.date === today);
  if (!entry) {
    entry = {
      date: today,
      total: 0,
      filtered: 0,
      textFiltered: 0,
      byLabel: { Sexy: 0, Porn: 0, Hentai: 0 },
      byPlatform: {},
    };
    stats.push(entry);
  }

  entry.total++;
  if (label) {
    entry.filtered++;
    if (source === 'text') entry.textFiltered = (entry.textFiltered || 0) + 1;
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

// --- Inference Queue ---

const inferenceQueue = [];
let activeInferences = 0;
const MAX_CONCURRENT = 3;

let classifyFn = null;

function processQueue() {
  while (activeInferences < MAX_CONCURRENT && inferenceQueue.length > 0) {
    const { imageUrl, sendResponse } = inferenceQueue.shift();
    activeInferences++;

    classifyFn(imageUrl).then((result) => {
      activeInferences--;
      sendResponse(result);
      processQueue();
    });
  }
}

// --- Setup ---

/**
 * Initializes shared background logic.
 * @param {Object} opts
 * @param {Function} opts.initBackend  — called on install/startup (e.g. ensure offscreen doc or load model)
 * @param {Function} opts.classify     — (imageUrl) => Promise<result>  browser-specific classification
 * @param {Function} [opts.getModelReady] — () => boolean, optional model readiness check
 */
export function setup({ initBackend, classify, getModelReady }) {
  classifyFn = classify;

  const isModelReady = getModelReady || (() => true);

  // --- Lifecycle Events ---

  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get('settings');
    if (!existing.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      console.log('[Background] Default settings initialized');
    }
    await initBackend();
  });

  chrome.runtime.onStartup.addListener(async () => {
    await initBackend();
  });

  // --- Message Routing ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === 'GET_SETTINGS') {
      chrome.storage.local.get('settings').then(({ settings }) => {
        sendResponse({ settings: settings || DEFAULT_SETTINGS });
      });
      return true;
    }

    if (message.type === 'CLASSIFY_IMAGE') {
      initBackend()
        .then(() => {
          inferenceQueue.push({ imageUrl: message.imageUrl, sendResponse });
          processQueue();
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true;
    }

    if (message.type === 'GET_STATUS') {
      chrome.storage.local.get('settings').then(({ settings }) => {
        sendResponse({ enabled: settings?.enabled ?? true, modelReady: isModelReady() });
      });
      return true;
    }

    if (message.type === 'RECORD_STAT') {
      recordClassification(message.label, message.platformId, message.source);
      return false;
    }

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

  });
}
