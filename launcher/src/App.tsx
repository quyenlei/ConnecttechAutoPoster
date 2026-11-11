import { useCallback, useEffect, useState } from 'react';
import { checkUpdates, errorMessage, getStatus, launchBrowser, onProgress, onStatus, pickFolder, setMode, useCapFolder, type Mode, type Progress, type Status } from './api';
import { ChooseMode } from './screens/ChooseMode';
import { ChromeGuide } from './screens/ChromeGuide';
import { Installing } from './screens/Installing';
import { Ready } from './screens/Ready';
import { Settings } from './screens/Settings';

type View = 'main' | 'choose' | 'guide' | 'settings';

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
  const [progress, setProgress] = useState<Partial<Record<Progress['item'], Progress>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  // In React state too: setting only localStorage would not re-render the guide away.
  const [guideDone, setGuideDone] = useState(readGuideDone);

  useEffect(() => {
    void getStatus().then(setStatus);
    const off = [onStatus(setStatus), onProgress((p) => setProgress((all) => ({ ...all, [p.item]: p })))];
    return () => off.forEach((p) => void p.then((stop) => stop()));
  }, []);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setFailure(null);
    setProgress({});
    try {
      await work();
    } catch (e) {
      setFailure(errorMessage(String(e)));
    }
    setStatus(await getStatus());
  }, []);

  async function choose(mode: Mode) {
    setView('main');
    if (mode === 'chrome') {
      try { localStorage.removeItem(GUIDE_DONE); } catch { /* storage unavailable */ }
      setGuideDone(false);
    }
    await run(async () => {
      setStatus(await setMode(mode));
      await checkUpdates();
    });
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

  function finishGuide() {
    try { localStorage.setItem(GUIDE_DONE, '1'); } catch { /* storage unavailable */ }
    setGuideDone(true);
    setView('main');
  }

  if (!status) return <main className="app" aria-busy="true" />;

  let content;
  if (!status.mode || view === 'choose') {
    content = <ChooseMode platformSupported={status.platformSupported} current={status.mode} onChoose={(m) => void choose(m)} onCancel={status.mode ? () => setView('main') : undefined} />;
  } else if (view === 'settings') {
    content = <Settings status={status} onChangeMode={() => setView('choose')} onClose={() => setView('main')} />;
  } else if (status.busy && (!status.capVersion || Object.keys(progress).length > 0)) {
    content = <Installing mode={status.mode} progress={progress} />;
  } else if (!status.capVersion) {
    content = (
      <section className="screen" aria-labelledby="retry-title">
        <h1 id="retry-title" className="screen__title">Chưa cài xong</h1>
        <p className="screen__lead">{status.error ? errorMessage(status.error) : 'Bấm để tải và cài CAP.'}</p>
        <div className="screen__actions">
          <button className="button button--primary" type="button" onClick={() => void run(checkUpdates)}>Thử lại</button>
          <button className="button button--link" type="button" onClick={() => setView('choose')}>Đổi cách dùng</button>
        </div>
      </section>
    );
  } else if (status.mode === 'chrome' && (view === 'guide' || !guideDone)) {
    content = <ChromeGuide extensionPath={status.extensionPath} onDone={finishGuide} onAdopt={() => void adoptFolder()} />;
  } else {
    content = (
      <Ready
        status={status}
        onLaunch={() => void run(launchBrowser)}
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
