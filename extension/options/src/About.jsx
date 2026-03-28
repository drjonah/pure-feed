import './About.css';

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
  textFilterEnabled: false,
};

export default function About() {
  const version = chrome.runtime.getManifest().version;

  function exportStats() {
    chrome.storage.local.get('stats', ({ stats }) => {
      const blob = new Blob([JSON.stringify(stats || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pure-feed-stats-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function resetStats() {
    if (!window.confirm('Reset all stats? This cannot be undone.')) return;
    chrome.storage.local.remove('stats');
  }

  function resetSettings() {
    if (!window.confirm('Reset all settings to defaults? This cannot be undone.')) return;
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  return (
    <div className="about">
      <section className="about-section">
        <h2>Info</h2>

        <div className="privacy-badge">
          <span className="privacy-icon">🔒</span>
          <div>
            <div className="privacy-text">100% On-Device Processing</div>
            <div className="privacy-sub">No images ever leave your browser</div>
          </div>
        </div>

        <div className="info-row">
          <span>Extension version</span>
          <span>v{version}</span>
        </div>
        <div className="info-row">
          <span>ML model</span>
          <span>MobileNet v2 (NSFW.js)</span>
        </div>
        <div className="info-row">
          <span>Supported platforms</span>
          <span>X · Reddit · Instagram</span>
        </div>
      </section>

      <section className="about-section">
        <h2>Data</h2>
        <div className="action-row">
          <div>
            <div className="action-label">Export Stats</div>
            <div className="action-desc">Download all statistics as a JSON file</div>
          </div>
          <button className="btn" onClick={exportStats}>Export</button>
        </div>
        <div className="action-row">
          <div>
            <div className="action-label">Reset Stats</div>
            <div className="action-desc">Clear all collected statistics</div>
          </div>
          <button className="btn btn-danger" onClick={resetStats}>Reset</button>
        </div>
        <div className="action-row">
          <div>
            <div className="action-label">Reset to Defaults</div>
            <div className="action-desc">Restore all settings to their defaults</div>
          </div>
          <button className="btn btn-danger" onClick={resetSettings}>Reset</button>
        </div>
      </section>
    </div>
  );
}
