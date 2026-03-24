// Service Worker — message bus and offscreen document manager

// --- Offscreen Document Management ---

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

let creatingPromise = null;
let modelReady = false;

async function ensureOffscreenDocument() {
  if (creatingPromise) return creatingPromise;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_URL],
  });

  if (existingContexts.length > 0) {
    modelReady = true;
    return;
  }

  creatingPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['DOM_SCRAPING'],
    justification: 'TensorFlow.js requires DOM/Canvas API for ML inference',
  });

  await creatingPromise;
  creatingPromise = null;
  modelReady = true;
}

// --- Default Settings ---

const DEFAULT_SETTINGS = {
  enabled: true,
  strictness: 'moderate',
  platforms: { x: true, reddit: true, instagram: true },
  thresholds: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  actions: { Sexy: 'blur', Porn: 'blur', Hentai: 'blur' },
  skipSmallImages: true,
  smallImageThreshold: 100,
  checkVideoFrames: true,
  showFilteredCount: true,
};

// --- Strictness Presets ---

const STRICTNESS_PRESETS = {
  relaxed:  { Sexy: 0.9, Porn: 0.8, Hentai: 0.8 },
  moderate: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  strict:   { Sexy: 0.4, Porn: 0.3, Hentai: 0.3, Drawing: 0.7 },
};

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

// --- Lifecycle Events ---

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('settings');
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    console.log('[SW] Default settings initialized');
  }
  await ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreenDocument();
});

// --- Inference Queue ---

const inferenceQueue = [];
let activeInferences = 0;
const MAX_CONCURRENT = 3;

function processQueue() {
  while (activeInferences < MAX_CONCURRENT && inferenceQueue.length > 0) {
    const { imageUrl, sendResponse } = inferenceQueue.shift();
    activeInferences++;

    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_IMAGE', imageUrl },
      (result) => {
        activeInferences--;
        sendResponse(result);
        processQueue();
      }
    );
  }
}

// --- Message Routing ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse({ settings: settings || DEFAULT_SETTINGS });
    });
    return true;
  }

  if (message.type === 'CLASSIFY_IMAGE') {
    ensureOffscreenDocument()
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
      sendResponse({ enabled: settings?.enabled ?? true, modelReady });
    });
    return true;
  }

  if (message.type === 'RECORD_STAT') {
    recordClassification(message.label, message.platformId);
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
