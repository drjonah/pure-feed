// Firefox Background Script — runs TF.js directly (background pages have DOM access)

import { setup } from './shared.js';
import { loadModel, classifyFromUrl, isModelReady } from './classifier.js';

setup({
  initBackend: loadModel,
  classify: classifyFromUrl,
  getModelReady: isModelReady,
});
