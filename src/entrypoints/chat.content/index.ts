import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { chatboxItem, type ChatboxState } from '@/lib/storage';
import styles from './style.scss?inline';

const HOST_TAG = 'cap-chat-host';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small stroke icon; `paths` are SVG path data. */
function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cap-chat__icon');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const ICONS = {
  logo: ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4 20-7Z'],
  minimize: ['M5 12h14'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  shrink: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
};

function iconButton(label: string, paths: string[]): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cap-chat__header-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(paths));
  return button;
}

/**
 * A chat-style window in the bottom-right corner of every Facebook page, like Messenger's: a round button opens
 * it; it can be minimised to its title bar, expanded to the full dashboard, or closed. Its content is the
 * extension's own `chatbox.html` / `options.html` in an iframe, so no separate tab is opened.
 * Display only: it reads nothing from the page and clicks nothing on it. It lives in a shadow root outside
 * <body>, so Facebook's styles do not reach it and the page driver (`fb-dom.ts`) never sees it.
 */
export default defineContentScript({
  matches: ['*://*.facebook.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    if (window.top !== window) return;
    // A copy left on the page by an earlier version of the extension (reloaded or updated) is replaced.
    document.querySelector(HOST_TAG)?.remove();

    const host = document.createElement(HOST_TAG);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'cap-chat__launcher';
    launcher.setAttribute('aria-label', 'Mở Connecttech Auto Poster');
    launcher.title = 'Connecttech Auto Poster';
    launcher.append(icon(ICONS.logo));

    const box = document.createElement('section');
    box.className = 'cap-chat__window';
    box.setAttribute('aria-label', 'Connecttech Auto Poster');

    const header = document.createElement('header');
    header.className = 'cap-chat__header';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'cap-chat__title';
    const badge = document.createElement('span');
    badge.className = 'cap-chat__avatar';
    badge.append(icon(ICONS.logo));
    const name = document.createElement('span');
    name.textContent = 'Auto Poster';
    title.append(badge, name);
    const expand = iconButton('Mở rộng', ICONS.expand);
    const minimize = iconButton('Thu nhỏ', ICONS.minimize);
    const close = iconButton('Đóng', ICONS.close);
    header.append(title, expand, minimize, close);

    const frame = document.createElement('iframe');
    frame.className = 'cap-chat__frame';
    frame.title = 'Connecttech Auto Poster';
    box.append(header, frame);

    let state: ChatboxState = await chatboxItem.getValue();

    /**
     * After the extension is reloaded or updated, this copy of the script is cut off from it: storage and
     * extension URLs throw "Extension context invalidated". The window is then replaced by a note asking to
     * reload the page, which starts the new version. `ctx.isInvalid` also fires `onInvalidated`.
     */
    function showReloadNote() {
      const note = document.createElement('section');
      note.className = 'cap-chat__stale';
      note.setAttribute('role', 'status');
      const text = document.createElement('p');
      text.className = 'cap-chat__stale-text';
      text.textContent = 'Connecttech Auto Poster vừa được cập nhật. Tải lại trang để dùng tiếp.';
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.className = 'cap-chat__stale-button';
      reload.textContent = 'Tải lại trang';
      reload.addEventListener('click', () => location.reload());
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'cap-chat__stale-button';
      dismiss.textContent = 'Ẩn';
      dismiss.addEventListener('click', () => host.remove());
      note.append(text, reload, dismiss);
      launcher.remove();
      box.remove();
      root.append(note);
    }
    ctx.onInvalidated(showReloadNote);
    // Notice it without waiting for a click: the check runs on each tick and stops once invalidated.
    ctx.setInterval(() => undefined, 3000);
    /** Runs a handler only while the extension is still reachable. */
    const live = (handler: () => void) => () => {
      if (!ctx.isInvalid) handler();
    };

    function render() {
      launcher.hidden = state.open;
      box.hidden = !state.open;
      box.classList.toggle('cap-chat__window--minimized', state.minimized);
      box.classList.toggle('cap-chat__window--expanded', state.expanded && !state.minimized);
      title.setAttribute('aria-label', state.minimized ? 'Mở lại Auto Poster' : 'Auto Poster');
      title.disabled = !state.minimized;
      const label = state.expanded ? 'Thu gọn' : 'Mở rộng';
      expand.setAttribute('aria-label', label);
      expand.title = label;
      expand.replaceChildren(icon(state.expanded ? ICONS.shrink : ICONS.expand));
      // The frame loads only once the window is shown, never on every Facebook page in the background.
      const page = state.expanded ? 'options' : 'chatbox';
      if (state.open && !state.minimized && frame.dataset.page !== page) {
        frame.dataset.page = page;
        frame.src = browser.runtime.getURL(state.expanded ? '/options.html#campaigns' : '/chatbox.html');
      }
    }

    function update(patch: Partial<ChatboxState>) {
      state = { ...state, ...patch };
      render();
      chatboxItem.setValue(state).catch(() => undefined); // only fails once the extension was reloaded
    }

    launcher.addEventListener('click', live(() => {
      update({ open: true, minimized: false });
      close.focus();
    }));
    title.addEventListener('click', live(() => update({ minimized: false })));
    minimize.addEventListener('click', live(() => update({ minimized: true })));
    expand.addEventListener('click', live(() => update({ expanded: !state.expanded, minimized: false })));
    close.addEventListener('click', live(() => {
      update({ open: false });
      launcher.focus();
    }));
    // The same window state in every Facebook tab, like Messenger chats.
    chatboxItem.watch((next) => {
      state = next;
      render();
    });

    render();
    root.append(style, launcher, box);
    // Outside <body>: Facebook re-renders the body and would drop unknown children.
    document.documentElement.append(host);
  },
});
