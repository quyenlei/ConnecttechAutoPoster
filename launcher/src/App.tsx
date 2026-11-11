import { useCallback, useEffect, useState } from 'react';
import { checkUpdates, errorMessage, getStatus, onProgress, onStatus, pickFolder, useCapFolder, type Progress, type Status } from './api';
import { ChromeGuide } from './screens/ChromeGuide';
import { Installing } from './screens/Installing';
import { Ready } from './screens/Ready';
import { Settings } from './screens/Settings';

type View = 'main' | 'guide' | 'settings';

const GUIDE_DONE = 'guideDone';

function readGuideDone(): boolean {
  try {
    return localStorage.getItem(GUIDE_DONE) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [view, setView] = useState<View>('main');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // In React state too: setting only localStorage would not re-render the guide away.
  const [guideDone, setGuideDone] = useState(readGuideDone);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setFailure(null);
    setProgress(null);
    try {
      await work();
    } catch (e) {
      setFailure(errorMessage(String(e)));
    }
    setStatus(await getStatus());
  }, []);

  useEffect(() => {
    // First start: put CAP in the app's folder right away, so the guide has a folder to point at.
    void getStatus().then((s) => {
      setStatus(s);
      if (!s.capVersion && !s.busy) void run(checkUpdates);
    });
    const off = [onStatus(setStatus), onProgress(setProgress)];
    return () => off.forEach((p) => void p.then((stop) => stop()));
  }, [run]);

  function finishGuide() {
    try { localStorage.setItem(GUIDE_DONE, '1'); } catch { /* storage unavailable */ }
    setGuideDone(true);
    setView('main');
  }

  /** Chrome already loads CAP from a folder: keep that one up to date (no reinstall, data stays). */
  async function adoptFolder() {
    const path = await pickFolder('Chọn thư mục CAP mà Chrome đang dùng (Loaded from)');
    if (!path) return;
    await run(async () => {
      setStatus(await useCapFolder(path));
      finishGuide();
      await checkUpdates();
    });
  }

  if (!status) return <main className="app" aria-busy="true" />;

  let content;
  if (view === 'settings') {
    content = <Settings status={status} onClose={() => setView('main')} />;
  } else if (status.busy && (!status.capVersion || progress)) {
    content = <Installing progress={progress} />;
  } else if (!status.capVersion) {
    content = (
      <section className="screen" aria-labelledby="retry-title">
        <h1 id="retry-title" className="screen__title">Chưa tải được CAP</h1>
        <p className="screen__lead">{status.error ? errorMessage(status.error) : 'Bấm để tải và cài CAP.'}</p>
        <div className="screen__actions">
          <button className="button button--primary" type="button" onClick={() => void run(checkUpdates)}>Thử lại</button>
          <button className="button" type="button" onClick={() => void adoptFolder()}>Chọn thư mục CAP đang dùng</button>
        </div>
      </section>
    );
  } else if (view === 'guide' || !guideDone) {
    content = <ChromeGuide extensionPath={status.extensionPath} onDone={finishGuide} onAdopt={() => void adoptFolder()} />;
  } else {
    content = (
      <Ready
        status={status}
        onCheck={() => void run(checkUpdates)}
        onGuide={() => setView('guide')}
        onSettings={() => setView('settings')}
        onAdopt={() => void adoptFolder()}
      />
    );
  }

  return (
    <main className="app">
      {content}
      {failure && <p className="notice notice--error" role="alert">{failure}</p>}
    </main>
  );
}
