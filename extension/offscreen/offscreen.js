import { loadModel, classifyFromUrl, isModelReady } from '../background/classifier.js';

const pendingQueue = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLASSIFY_IMAGE') return false;

  const { imageUrl } = message;

  if (!isModelReady()) {
    pendingQueue.push({ imageUrl, sendResponse });
    return true;
  }

  classifyFromUrl(imageUrl).then(sendResponse);
  return true;
});

// Start loading immediately; process pending queue once ready
loadModel()
  .then(async () => {
    while (pendingQueue.length > 0) {
      const { imageUrl, sendResponse } = pendingQueue.shift();
      const result = await classifyFromUrl(imageUrl);
      sendResponse(result);
    }
  })
  .catch(err => console.error('[Offscreen] Model load failed:', err));
