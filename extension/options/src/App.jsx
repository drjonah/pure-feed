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
      <h1>Pure Feed Settings</h1>
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
      <div className="tab-content">
        {tab === 'Controls' && <Controls />}
        {tab === 'Stats' && <Stats />}
        {tab === 'About' && <About />}
      </div>
    </div>
  );
}
