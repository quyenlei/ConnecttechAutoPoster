import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { RunBar } from './RunBar';
import { UpdateNotice } from './UpdateNotice';
import { ActivityView } from './views/ActivityView';
import { BackupView } from './views/BackupView';
import { CampaignsView } from './views/CampaignsView';
import { GroupsView } from './views/GroupsView';
import { OverviewView } from './views/OverviewView';

const TABS = [
  { id: 'campaigns', label: 'Chiến dịch', description: 'Soạn và chạy' },
  { id: 'groups', label: 'Nhóm', description: 'Danh sách Facebook' },
  { id: 'overview', label: 'Tổng quan', description: 'Kết quả hoạt động' },
  { id: 'activity', label: 'Nhật ký', description: 'Theo dõi lượt chạy' },
  { id: 'backup', label: 'Sao lưu', description: 'Dữ liệu của bạn' },
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

  const current = TABS.find((t) => t.id === tab)!;
  const icons: Record<TabId, string> = {
    campaigns: 'M4 5h16v14H4z M8 9h8 M8 13h6',
    groups: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 4a3 3 0 0 1 0 6 M20 20v-2a4 4 0 0 0-2-3.46',
    overview: 'M4 13h6V4H4z M14 20h6v-9h-6z M4 20h6v-3H4z M14 7h6V4h-6z',
    activity: 'M4 5h16v14H4z M8 9h8 M8 13h8 M8 17h5',
    backup: 'M4 16v4h16v-4 M12 4v12 M8 12l4 4 4-4',
  };

  return (
    <div className="shell">
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
              <span className="shell__brand-subtitle">Facebook workspace</span>
            </div>
          </div>
          <nav className="shell__tabs" aria-label="Điều hướng chính">
            {TABS.map((t) => (
              <button key={t.id} className="shell__tab" type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                <svg className="shell__nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[t.id]} /></svg>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="shell__sidebar-note"><span className="shell__sidebar-dot" /> Dữ liệu lưu trên thiết bị</div>
        </div>
      </header>
      <main id="main" className="container shell__main" tabIndex={-1}>
        <div className="shell__page-heading">
          <div><p className="shell__breadcrumb">Không gian làm việc <span>/</span> {current.label}</p><h2>{current.label}</h2><p>{current.description}</p></div>
        </div>
        <div className="shell__stack">
          <UpdateNotice withCheck={tab === 'backup'} />
          <RunBar />
          {tab === 'campaigns' && <CampaignsView />}
          {tab === 'groups' && <GroupsView />}
          {tab === 'overview' && <OverviewView />}
          {tab === 'activity' && <ActivityView />}
          {tab === 'backup' && <BackupView />}
        </div>
      </main>
    </div>
  );
}
