// Chrome Service Worker — offscreen document management + shared setup

import { setup } from './shared.js';

// --- Offscreen Document Management (Chrome-only) ---

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

// Classification via offscreen document message passing
function classifyViaOffscreen(imageUrl) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'CLASSIFY_IMAGE', imageUrl },
      (result) => resolve(result)
    );
  });
}

// --- Initialize ---

setup({
  initBackend: ensureOffscreenDocument,
  classify: classifyViaOffscreen,
  getModelReady: () => modelReady,
});
