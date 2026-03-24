import { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
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
  Tooltip,
  Legend
);

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

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
    return stats.filter(s => s.date >= cutoffStr).sort((a, b) => a.date.localeCompare(b.date));
  }, [stats, range]);

  const summary = useMemo(() => {
    let total = 0;
    let filteredCount = 0;
    const byLabel = { Sexy: 0, Porn: 0, Hentai: 0 };
    const byPlatform = {};

    for (const entry of filtered) {
      total += entry.total;
      filteredCount += entry.filtered;
      for (const [label, count] of Object.entries(entry.byLabel || {})) {
        byLabel[label] = (byLabel[label] || 0) + count;
      }
      for (const [platform, count] of Object.entries(entry.byPlatform || {})) {
        byPlatform[platform] = (byPlatform[platform] || 0) + count;
      }
    }

    const topPlatform = Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0];
    const rate = total > 0 ? ((filteredCount / total) * 100).toFixed(1) : '0.0';

    return { total, filteredCount, rate, byLabel, byPlatform, topPlatform: topPlatform?.[0] || '-' };
  }, [filtered]);

  const isEmpty = filtered.length === 0 || summary.total === 0;

  const lineData = {
    labels: filtered.map(s => s.date.slice(5)),
    datasets: [
      {
        label: 'Scanned',
        data: filtered.map(s => s.total),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        tension: 0.3,
      },
      {
        label: 'Filtered',
        data: filtered.map(s => s.filtered),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.3,
      },
    ],
  };

  const doughnutData = {
    labels: Object.keys(summary.byLabel),
    datasets: [{
      data: Object.values(summary.byLabel),
      backgroundColor: ['#f59e0b', '#ef4444', '#8b5cf6'],
    }],
  };

  const barData = {
    labels: Object.keys(summary.byPlatform).map(p => p.charAt(0).toUpperCase() + p.slice(1)),
    datasets: [{
      label: 'Filtered',
      data: Object.values(summary.byPlatform),
      backgroundColor: ['#3b82f6', '#f97316', '#ec4899'],
    }],
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
        <div className="empty-state">No data yet</div>
      ) : (
        <>
          <div className="summary-cards">
            <div className="card">
              <div className="card-value">{summary.total}</div>
              <div className="card-label">Scanned</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.filteredCount}</div>
              <div className="card-label">Filtered</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.rate}%</div>
              <div className="card-label">Filter rate</div>
            </div>
            <div className="card">
              <div className="card-value">{summary.topPlatform}</div>
              <div className="card-label">Top platform</div>
            </div>
          </div>

          <div className="chart-container">
            <h3>Activity over time</h3>
            <Line data={lineData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
          </div>

          <div className="chart-row">
            <div className="chart-container chart-half">
              <h3>By label</h3>
              <Doughnut data={doughnutData} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
            </div>
            <div className="chart-container chart-half">
              <h3>By platform</h3>
              <Bar data={barData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
