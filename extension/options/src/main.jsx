import { createRoot } from 'react-dom/client';
import App from './App';

function render() {
  createRoot(document.getElementById('root')).render(<App />);
}

// In dev mode (no real Chrome APIs), load the mock before rendering
if (typeof chrome === 'undefined' || !chrome.storage) {
  import('./chrome-mock.js').then(render);
} else {
  render();
}
