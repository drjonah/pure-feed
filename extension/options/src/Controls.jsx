import { useState, useEffect, useRef } from 'react';
import './Controls.css';

const PLATFORMS = [
  { id: 'x',         label: 'X (Twitter)', dotClass: 'platform-dot-x' },
  { id: 'reddit',    label: 'Reddit',      dotClass: 'platform-dot-reddit' },
  { id: 'instagram', label: 'Instagram',   dotClass: 'platform-dot-instagram' },
];

const LABELS        = ['Sexy', 'Porn', 'Hentai', 'Drawing'];
const ACTION_LABELS = ['Sexy', 'Porn', 'Hentai'];
const STRICTNESS    = ['relaxed', 'moderate', 'strict'];

// Compress + resize an uploaded image to a data URL (JPEG, max 600px, ~80–200 KB)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ({ target: { result } }) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

function approxKB(dataUrl) {
  return Math.round(dataUrl.length * 0.75 / 1024);
}

export default function Controls() {
  const [settings, setSettings]               = useState(null);
  const [replacementImage, setReplacementImage] = useState(null); // { dataUrl, name } | null
  const fileInputRef = useRef(null);

  useEffect(() => {
    chrome.storage.local.get(['settings', 'replacementImage'], ({ settings: s, replacementImage: img }) => {
      if (s) setSettings(s);
      setReplacementImage(img || null);
    });

    const listener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) setSettings(changes.settings.newValue);
      if ('replacementImage' in changes) setReplacementImage(changes.replacementImage.newValue || null);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (!settings) return <div className="loading">Loading settings…</div>;

  function update(patch) {
    chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }

  function updateThreshold(label, value) {
    const thresholds = { ...settings.thresholds, [label]: value };
    chrome.storage.local.set({ settings: { ...settings, strictness: 'custom', thresholds } });
  }

  function updateAction(label, action) {
    update({ actions: { ...settings.actions, [label]: action } });
  }

  function updatePlatform(id, enabled) {
    update({ platforms: { ...settings.platforms, [id]: enabled } });
  }

  function setStrictness(level) {
    chrome.runtime.sendMessage({ type: 'SET_STRICTNESS', level });
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    const stored = { dataUrl, name: file.name };
    chrome.storage.local.set({ replacementImage: stored });
    setReplacementImage(stored);
    e.target.value = ''; // allow re-uploading the same file
  }

  function resetToDefault() {
    chrome.storage.local.remove('replacementImage');
    setReplacementImage(null);
  }

  const defaultThumbUrl = chrome.runtime.getURL('assets/placeholder.png');

  return (
    <div className="controls">

      {/* General */}
      <section className="control-section">
        <h2>General</h2>
        <div className="control-row">
          <span className="row-text">Filter enabled</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <span className="toggle-track"></span>
          </label>
        </div>
      </section>

      {/* Platforms */}
      <section className="control-section">
        <h2>Platforms</h2>
        {PLATFORMS.map(({ id, label, dotClass }) => (
          <div key={id} className="platform-row">
            <div className="platform-info">
              <span className={`platform-dot ${dotClass}`}></span>
              <span className="platform-name">{label}</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.platforms[id] ?? true}
                onChange={(e) => updatePlatform(id, e.target.checked)}
              />
              <span className="toggle-track"></span>
            </label>
          </div>
        ))}
      </section>

      {/* Strictness */}
      <section className="control-section">
        <h2>
          Strictness
          {settings.strictness === 'custom' && (
            <span className="custom-badge">Custom</span>
          )}
        </h2>
        <div className="segment-control">
          {STRICTNESS.map((level) => (
            <button
              key={level}
              className={`segment${settings.strictness === level ? ' active' : ''}`}
              onClick={() => setStrictness(level)}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {/* Advanced Thresholds */}
      <details className="control-section">
        <summary>
          <h2>Advanced Thresholds</h2>
          <span className="summary-arrow">&#9658;</span>
        </summary>
        <div className="thresholds">
          {LABELS.map((label) => (
            <div key={label} className="threshold-row">
              <span className="threshold-label">{label}</span>
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

      {/* Actions */}
      <section className="control-section">
        <h2>Actions per label</h2>
        {ACTION_LABELS.map((label) => (
          <div key={label} className="control-row">
            <span className="row-text">{label}</span>
            <select
              value={settings.actions[label] || 'blur'}
              onChange={(e) => updateAction(label, e.target.value)}
            >
              <option value="blur">Blur</option>
              <option value="hide">Hide</option>
              <option value="replace">Replace</option>
              <option value="delete">Delete post</option>
            </select>
          </div>
        ))}
      </section>

      {/* Replacement Image */}
      <section className="control-section">
        <h2>Replacement image</h2>
        <div className="image-picker">
          <div className="image-thumb-wrap">
            <img
              className="image-thumb"
              src={replacementImage?.dataUrl || defaultThumbUrl}
              alt="Replacement preview"
              onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
          </div>
          <div className="image-picker-info">
            <div className="image-picker-name">
              {replacementImage ? replacementImage.name : 'Default placeholder'}
            </div>
            <div className="image-picker-meta">
              {replacementImage
                ? `Custom · ${approxKB(replacementImage.dataUrl)} KB`
                : 'Used when action is set to "Replace"'}
            </div>
            <div className="image-picker-btns">
              <button className="btn-upload" onClick={() => fileInputRef.current.click()}>
                {replacementImage ? 'Change image' : 'Upload image'}
              </button>
              {replacementImage && (
                <button className="btn-reset-img" onClick={resetToDefault}>
                  Reset to default
                </button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
      </section>

      {/* Image Filtering */}
      <section className="control-section">
        <h2>Image filtering</h2>
        <div className="control-row">
          <span className="row-text">Skip small images</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.skipSmallImages}
              onChange={(e) => update({ skipSmallImages: e.target.checked })}
            />
            <span className="toggle-track"></span>
          </label>
        </div>
        {settings.skipSmallImages && (
          <div className="control-row">
            <span className="row-text">Min size (px)</span>
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
