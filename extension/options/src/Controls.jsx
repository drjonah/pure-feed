import { useState, useEffect } from 'react';
import './Controls.css';

const PLATFORMS = [
  { id: 'x', label: 'X' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'instagram', label: 'Instagram' },
];

const LABELS = ['Sexy', 'Porn', 'Hentai', 'Drawing'];
const ACTION_LABELS = ['Sexy', 'Porn', 'Hentai'];
const STRICTNESS_LEVELS = ['relaxed', 'moderate', 'strict'];

export default function Controls() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    chrome.storage.local.get('settings', ({ settings: s }) => {
      if (s) setSettings(s);
    });

    const listener = (changes, area) => {
      if (area === 'local' && changes.settings) {
        setSettings(changes.settings.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (!settings) return <div>Loading...</div>;

  function update(patch) {
    const updated = { ...settings, ...patch };
    chrome.storage.local.set({ settings: updated });
  }

  function updateThreshold(label, value) {
    const thresholds = { ...settings.thresholds, [label]: value };
    chrome.storage.local.set({
      settings: { ...settings, strictness: 'custom', thresholds },
    });
  }

  function updateAction(label, action) {
    const actions = { ...settings.actions, [label]: action };
    update({ actions });
  }

  function updatePlatform(id, enabled) {
    const platforms = { ...settings.platforms, [id]: enabled };
    update({ platforms });
  }

  function setStrictness(level) {
    chrome.runtime.sendMessage({ type: 'SET_STRICTNESS', level });
  }

  return (
    <div className="controls">
      <section className="control-section">
        <h2>General</h2>
        <label className="control-row">
          <span>Filter enabled</span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        </label>
      </section>

      <section className="control-section">
        <h2>Platforms</h2>
        {PLATFORMS.map(({ id, label }) => (
          <label key={id} className="control-row">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={settings.platforms[id] ?? true}
              onChange={(e) => updatePlatform(id, e.target.checked)}
            />
          </label>
        ))}
      </section>

      <section className="control-section">
        <h2>Strictness</h2>
        <div className="strictness-group">
          {STRICTNESS_LEVELS.map((level) => (
            <label key={level} className="strictness-option">
              <input
                type="radio"
                name="strictness"
                value={level}
                checked={settings.strictness === level}
                onChange={() => setStrictness(level)}
              />
              <span>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
            </label>
          ))}
          {settings.strictness === 'custom' && (
            <span className="custom-badge">Custom</span>
          )}
        </div>
      </section>

      <details className="control-section">
        <summary><h2>Advanced Thresholds</h2></summary>
        <div className="thresholds">
          {LABELS.map((label) => (
            <div key={label} className="threshold-row">
              <label>{label}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.thresholds[label] ?? 1}
                onChange={(e) => updateThreshold(label, parseFloat(e.target.value))}
              />
              <span className="threshold-value">
                {(settings.thresholds[label] ?? 1).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </details>

      <section className="control-section">
        <h2>Actions</h2>
        {ACTION_LABELS.map((label) => (
          <div key={label} className="control-row">
            <span>{label}</span>
            <select
              value={settings.actions[label] || 'blur'}
              onChange={(e) => updateAction(label, e.target.value)}
            >
              <option value="blur">Blur</option>
              <option value="hide">Hide</option>
              <option value="replace">Replace</option>
            </select>
          </div>
        ))}
      </section>

      <section className="control-section">
        <h2>Small Images</h2>
        <label className="control-row">
          <span>Skip small images</span>
          <input
            type="checkbox"
            checked={settings.skipSmallImages}
            onChange={(e) => update({ skipSmallImages: e.target.checked })}
          />
        </label>
        {settings.skipSmallImages && (
          <div className="control-row">
            <span>Min size (px)</span>
            <input
              type="number"
              className="number-input"
              min="0"
              max="500"
              value={settings.smallImageThreshold}
              onChange={(e) => update({ smallImageThreshold: parseInt(e.target.value) || 0 })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
