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
  async main() {
    if (window.top !== window || document.querySelector(HOST_TAG)) return;

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
      void chatboxItem.setValue(state);
    }

    launcher.addEventListener('click', () => {
      update({ open: true, minimized: false });
      close.focus();
    });
    title.addEventListener('click', () => update({ minimized: false }));
    minimize.addEventListener('click', () => update({ minimized: true }));
    expand.addEventListener('click', () => update({ expanded: !state.expanded, minimized: false }));
    close.addEventListener('click', () => {
      update({ open: false });
      launcher.focus();
    });
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
