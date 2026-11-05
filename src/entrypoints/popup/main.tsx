import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { RunBar } from '@/ui/RunBar';
import '@/ui/styles/app.scss';

function Popup() {
  return (
    <div style={{ width: '22rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h1>Connecttech Auto Poster</h1>
      <RunBar />
      <button className="button button--primary" type="button" onClick={() => void browser.runtime.openOptionsPage()}>
        Open dashboard
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
