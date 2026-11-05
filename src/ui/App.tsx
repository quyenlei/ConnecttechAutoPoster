import { useState } from 'react';
import { RunBar } from './RunBar';
import { ActivityView } from './views/ActivityView';
import { CampaignsView } from './views/CampaignsView';
import { GroupsView } from './views/GroupsView';

const TABS = [
  { id: 'campaigns', label: 'Chiến dịch' },
  { id: 'groups', label: 'Nhóm' },
  { id: 'activity', label: 'Nhật ký' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const initialTab = (): TabId => {
  const hash = location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'campaigns';
};

export function App() {
  const [tab, setTab] = useState<TabId>(initialTab);
  const go = (id: TabId) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <>
      <header className="shell__header">
        <div className="container shell__header-inner">
          <div className="shell__brand">
            <h1>Connecttech Auto Poster</h1>
            <span className="u-muted">Chạy ngay trên thiết bị của bạn. Không cần tài khoản, không có máy chủ.</span>
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
      <main className="container shell__main">
        <div className="shell__stack">
          <RunBar />
          {tab === 'campaigns' && <CampaignsView />}
          {tab === 'groups' && <GroupsView />}
          {tab === 'activity' && <ActivityView />}
        </div>
      </main>
    </>
  );
}
