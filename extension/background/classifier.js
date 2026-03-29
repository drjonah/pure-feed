// Shared NSFW classification module — used by:
//   Chrome: offscreen/offscreen.js (via message passing)
//   Firefox: background/background.js (direct import)

import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';

let model = null;
let loadingPromise = null;

export async function loadModel() {
  if (model) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    await tf.ready();
    const modelUrl = chrome.runtime.getURL('models/mobilenet/model.json');
    model = await nsfwjs.load(modelUrl, { size: 224 });
    console.log('[Classifier] Model loaded, backend:', tf.getBackend());
  })();

  await loadingPromise;
  loadingPromise = null;
}

export async function classifyFromUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { success: false, error: `Fetch failed: ${response.status}` };
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const predictions = await model.classify(canvas);
    return { success: true, predictions };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function isModelReady() {
  return model !== null;
}
