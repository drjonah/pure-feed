import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';

let model = null;
let modelReady = false;
const pendingQueue = [];

async function loadModel() {
  // Set TF.js backend — prefer WebGL, fall back to WASM/CPU
  await tf.ready();
  const modelUrl = chrome.runtime.getURL('models/mobilenet/model.json');
  // nsfwjs.load appends 'model.json' if path doesn't end with it
  model = await nsfwjs.load(modelUrl, { size: 224 });
  modelReady = true;
  console.log('[Offscreen] Model loaded, backend:', tf.getBackend());

  // Process anything that arrived before model was ready
  while (pendingQueue.length > 0) {
    const { imageUrl, sendResponse } = pendingQueue.shift();
    const result = await classifyFromUrl(imageUrl);
    sendResponse(result);
  }
}

async function classifyFromUrl(imageUrl) {
  try {
    // Fetch the image as a blob
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { success: false, error: `Fetch failed: ${response.status}` };
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Draw bitmap to a canvas for TF.js to consume
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLASSIFY_IMAGE') return false;

  const { imageUrl } = message;

  if (!modelReady) {
    pendingQueue.push({ imageUrl, sendResponse });
    return true; // keep message channel open
  }

  classifyFromUrl(imageUrl).then(sendResponse);
  return true; // async response
});

// Start loading immediately
loadModel().catch(err => console.error('[Offscreen] Model load failed:', err));
