import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '@/ui/confirm';
import { browser } from 'wxt/browser';
import { RunBar } from '@/ui/RunBar';
import '@/ui/styles/app.scss';

function Popup() {
  return (
    <div className="popup">
      <div className="popup__heading"><span className="popup__mark" aria-hidden="true">C</span><div><h1 translate="no">Connecttech Auto Poster</h1><p>Đăng bài & bình luận Facebook</p></div></div>
      <span className="shell__version">Phiên bản {browser.runtime.getManifest().version}</span>
      <RunBar />
      <button className="button button--primary" type="button" onClick={() => void browser.runtime.openOptionsPage()}>
        Mở bảng điều khiển
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <Popup />
    </ConfirmProvider>
  </StrictMode>,
);
