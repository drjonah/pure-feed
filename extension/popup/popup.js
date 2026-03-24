// Load current settings and update toggle
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
  if (chrome.runtime.lastError || !response?.settings) return;
  document.getElementById('enableToggle').checked = response.settings.enabled;
});

// Load model status
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError || !response) return;
  const statusEl = document.getElementById('modelStatus');
  if (response.modelReady) {
    statusEl.innerHTML = '<span class="status-dot dot-green"></span>Ready';
  } else {
    statusEl.innerHTML = '<span class="status-dot dot-yellow"></span>Loading\u2026';
  }
});

// Filtered count — read from storage (placeholder until Phase 2 stats)
chrome.storage.local.get('stats', ({ stats }) => {
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats?.find(s => s.date === today);
  document.getElementById('filteredCount').textContent = todayStats?.filtered ?? '0';
});

// Settings button — open options page
document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Toggle handler — persist enabled state
document.getElementById('enableToggle').addEventListener('change', (e) => {
  chrome.storage.local.get('settings', ({ settings }) => {
    const updated = { ...settings, enabled: e.target.checked };
    chrome.storage.local.set({ settings: updated });
  });
});
