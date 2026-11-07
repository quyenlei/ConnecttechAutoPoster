import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { RunBar } from './RunBar';
import { ActivityView } from './views/ActivityView';
import { CampaignsView } from './views/CampaignsView';
import { GroupsView } from './views/GroupsView';
import { OverviewView } from './views/OverviewView';

const TABS = [
  { id: 'campaigns', label: 'Chiến dịch' },
  { id: 'groups', label: 'Nhóm' },
  { id: 'overview', label: 'Tổng quan' },
  { id: 'activity', label: 'Nhật ký' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const initialTab = (): TabId => {
  const hash = location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'campaigns';
};

export function App() {
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label ?? '';
    document.title = `${label} · Connecttech Auto Poster`;
  }, [tab]);
  const go = (id: TabId) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
      <a className="u-skip-link" href="#main">Bỏ qua điều hướng</a>
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <span className="shell__logo" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
              </svg>
            </span>
            <div className="shell__brand-text">
              <h1 translate="no">Connecttech Auto Poster</h1>
              <span className="shell__version">Phiên bản {browser.runtime.getManifest().version}</span>
              <span className="u-muted">Chạy ngay trên thiết bị của bạn. Không cần tài khoản, không có máy chủ.</span>
            </div>
          </div>
          <nav className="shell__tabs" aria-label="Điều hướng chính">
            {TABS.map((t) => (
              <button key={t.id} className="shell__tab" type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="container shell__main" tabIndex={-1}>
        <div className="shell__stack">
          <RunBar />
          {tab === 'campaigns' && <CampaignsView />}
          {tab === 'groups' && <GroupsView />}
          {tab === 'overview' && <OverviewView />}
          {tab === 'activity' && <ActivityView />}
        </div>
      </main>
    </>
  );
}
