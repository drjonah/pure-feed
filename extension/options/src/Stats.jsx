import { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import './Stats.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

const RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const CHART_OPTS = {
  responsive: true,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 16, font: { size: 12 } } } },
};

export default function Stats() {
  const [stats, setStats] = useState([]);
  const [range, setRange] = useState(7);

  useEffect(() => {
    chrome.storage.local.get('stats', ({ stats: s }) => {
      if (s) setStats(s);
    });

    const listener = (changes, area) => {
      if (area === 'local' && changes.stats) {
        setStats(changes.stats.newValue || []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return stats
      .filter(s => s.date >= cutoffStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [stats, range]);

  const summary = useMemo(() => {
    let total = 0, filteredCount = 0, textFilteredCount = 0;
    const byLabel    = { Sexy: 0, Porn: 0, Hentai: 0 };
    const byPlatform = {};

    for (const entry of filtered) {
      total              += entry.total;
      filteredCount      += entry.filtered;
      textFilteredCount  += entry.textFiltered || 0;
      for (const [lbl, n] of Object.entries(entry.byLabel    || {})) byLabel[lbl]    = (byLabel[lbl]    || 0) + n;
      for (const [plt, n] of Object.entries(entry.byPlatform || {})) byPlatform[plt] = (byPlatform[plt] || 0) + n;
    }

    const top  = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0];
    const rate = total > 0 ? ((filteredCount / total) * 100).toFixed(1) : '0.0';
    return { total, filteredCount, textFilteredCount, rate, byLabel, byPlatform, topPlatform: top?.[0] || '—' };
  }, [filtered]);

  const isEmpty = filtered.length === 0 || summary.total === 0;

  const lineData = {
    labels: filtered.map(s => s.date.slice(5)),
    datasets: [
      { label: 'Scanned', data: filtered.map(s => s.total),    borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', tension: 0.35, fill: true },
      { label: 'Filtered', data: filtered.map(s => s.filtered), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',   tension: 0.35, fill: true },
    ],
  };

  const doughnutData = {
    labels: Object.keys(summary.byLabel),
    datasets: [{ data: Object.values(summary.byLabel), backgroundColor: ['#f59e0b', '#ef4444', '#8b5cf6'], borderWidth: 0 }],
  };

  const barData = {
    labels: Object.keys(summary.byPlatform).map(p => p.charAt(0).toUpperCase() + p.slice(1)),
    datasets: [{ label: 'Filtered', data: Object.values(summary.byPlatform), backgroundColor: ['#3b82f6', '#f97316', '#ec4899'], borderRadius: 6, borderSkipped: false }],
  };

  return (
    <div className="stats">
      <div className="range-buttons">
        {RANGES.map(({ label, days }) => (
          <button
            key={days}
            className={range === days ? 'active' : ''}
            onClick={() => setRange(days)}
          >
            {label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">No data yet</div>
          <div className="empty-desc">
            Browse X, Reddit, or Instagram with the filter enabled to start collecting stats.
          </div>
        </div>
      ) : (
        <>
          <div className="summary-cards summary-top">
            <div className="card">
              <div className="card-value">{summary.total.toLocaleString()}</div>
              <div className="card-label">Scanned</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.filteredCount.toLocaleString()}</div>
              <div className="card-label">Filtered</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.textFilteredCount.toLocaleString()}</div>
              <div className="card-label">Text filtered</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.rate}%</div>
              <div className="card-label">Filter rate</div>
            </div>
          </div>
          <div className="summary-cards summary-bottom">
            <div className="card">
              <div className="card-value">{(summary.textFilteredCount || 0).toLocaleString()}</div>
              <div className="card-label">Text filtered</div>
            </div>
            <div className="card">
              <div className="card-value" style={{ fontSize: summary.topPlatform.length > 4 ? '16px' : undefined }}>
                {summary.topPlatform}
              </div>
              <div className="card-label">Top platform</div>
            </div>
          </div>

          <div className="chart-container">
            <h3>Activity over time</h3>
            <Line data={lineData} options={CHART_OPTS} />
          </div>

          <div className="chart-row">
            <div className="chart-container chart-half">
              <h3>By label</h3>
              <Doughnut data={doughnutData} options={CHART_OPTS} />
            </div>
            <div className="chart-container chart-half">
              <h3>By platform</h3>
              <Bar data={barData} options={{ ...CHART_OPTS, plugins: { ...CHART_OPTS.plugins, legend: { display: false } } }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
