import { useState } from 'react';
import Controls from './Controls';
import Stats from './Stats';
import About from './About';
import './index.css';

const TABS = ['Controls', 'Stats', 'About'];

export default function App() {
  const [tab, setTab] = useState('Controls');

  return (
    <div className="container">
      <div className="app-header">
        <div className="app-brand">
          <div className="app-logo">🛡️</div>
          <div>
            <h1 className="app-title">Pure Feed</h1>
            <p className="app-subtitle">On-device content filtering</p>
          </div>
        </div>
      </div>

      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={t === tab ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="tab-content" key={tab}>
        {tab === 'Controls' && <Controls />}
        {tab === 'Stats' && <Stats />}
        {tab === 'About' && <About />}
      </div>
    </div>
  );
}
