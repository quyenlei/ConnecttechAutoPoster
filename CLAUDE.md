# CLAUDE.md: Connecttech Auto Poster (CAP)

## What this is
Local-first Chrome extension (Manifest V3) that posts to Facebook groups the user has joined, with safe delays. No backend, no license server, no telemetry. Original clean-room code; never copy code, assets or branding from other products (e.g. the sibling `FacebookAutoPoster` folder is a third-party package and must not be reverse engineered or reused).

## Stack
WXT 0.21 · TypeScript (strict) · React 19 · SCSS (BEM) · Vitest + happy-dom · Playwright smoke test (Python). No Tailwind, no Bootstrap, no extra UI/state libraries unless the user asks.

## Commands
```bash
pnpm typecheck   # must be clean
pnpm test            # unit + DOM tests
pnpm build       # .output/chrome-mv3
pnpm test:e2e    # build + browser smoke test against a LOCAL MOCK (DNS-blocked, no real network)
pnpm test:updater # updater helper on this OS against a local mock (CI: Windows + macOS)
```
Run typecheck + test before claiming work done; run test:e2e after touching background, content script, storage or UI flows.

## Layout
- `src/lib/*` pure, framework-free logic; every change here needs a test in `tests/`.
- `src/lib/run-engine.ts` the only place for run/safety transitions.
- `src/lib/fb-dom.ts` the only place for Facebook selectors and text hints.
- `src/lib/limits.ts` hard safety limits.
- `src/entrypoints/background.ts` orchestration; `facebook.content/` page driver; `options/`, `popup/` UI roots.
- `updater/` optional one-click updater helper (Windows PowerShell + macOS bash, native messaging host) and its test; `.github/workflows/` release and updater CI.
- `src/ui/` React components; styles in `src/ui/styles/` (abstracts, base, components, layout, pages).
- `docs/` human docs; keep them in sync with behavior.

## Hard rules
1. **Never** run automated posting against real Facebook or the user's real groups. Tests use the local mock only. Do not weaken the DNS block in `e2e/smoke.py`.
2. **Never** weaken safety: min delay 30 s for posts, Safety Break, auto-pause after 5 failures, halt on checkpoint/blocked, skip non-member/no-permission. Never add detection-evasion features. One owner-approved exception (2026-11-10): comment campaigns may wait as little as 2 s between comments (`LIMITS.minCommentDelaySec`), with a 10 s minimum break between groups; in return they pause after 2 unconfirmed comments in a row and lock comment runs for 24 hours after a checkpoint/block. Do not lower these further or extend the exception to posts without the owner asking.
3. No remote calls, analytics, remote code, or eval. No new permission or host without updating `docs/SAFETY_AND_PRIVACY.md` and `CHANGELOG.md`. One owner-approved exception (2026-11-10): the update check (`lib/update.ts`), at most once a day plus the user's button: a plain GET of `update.json` on the `update` branch via raw.githubusercontent.com (added 2026-11-11 to avoid the API's per-IP limit), and of GitHub's latest-release API for the public CAP repository only when that file cannot be read. It only reads a version and github.com links; nothing is downloaded or executed automatically. Second owner-approved exception (2026-11-11): the optional updater helper (`updater/`, `lib/updater.ts`, permission `nativeMessaging`, fixed ID via manifest `key`). Only after the user presses **Cập nhật ngay** and confirms does it download the release zip named in `update.json` from the CAP releases on github.com, verify its SHA-256 and replace CAP's folder; CAP then reloads. It never runs downloaded files, runs nothing in the background, and is allowed only for CAP's ID. Do not add other remote calls or let CAP itself download code.
4. Do not read, store or send Facebook cookies/tokens.
5. State lives in `chrome.storage.local` only; the service worker must stay restart-safe (use alarms, not long timers).
6. Be honest: the posting flow is verified on a mock, **not** on live Facebook, until a human confirms it. Say so in reports.

## Conventions
- TypeScript strict, no `any`; prefer small pure functions; explicit imports from `wxt/*`.
- SCSS: BEM `block__element-sub-element--modifier` (e.g. `campaigns__list-item`), lowercase hyphenated, `rem` units (px only for borders), no `!important`, no ID selectors, no inline styles (the small popup wrapper is the one exception to remove when touched), light/dark via CSS variables.
- A11y: real `<label>` for every input, `aria-label` on icon/ambiguous buttons, visible focus, semantic landmarks, one `h1` per page, descriptive link text.
- Blade/Laravel guidance in the user's global CLAUDE.md does not apply here; its spirit does (semantic HTML, accessibility, BEM naming, simplicity, performance).
- UI text in Vietnamese (user decision). Facebook DOM text hints in `fb-dom.ts` stay as Facebook renders them. Package manager: pnpm (never npm). Commits small and imperative; do not commit unless asked.

## When Facebook changes
Edit `src/lib/fb-dom.ts`, add a case to `tests/fb-dom.test.ts`, update `MOCK` in `e2e/smoke.py` if the flow changed, note it in `CHANGELOG.md`.

## Docs map
README (overview) · docs/USER_GUIDE · docs/ARCHITECTURE · docs/DEVELOPMENT · docs/SAFETY_AND_PRIVACY · docs/ROADMAP · CHANGELOG. Detailed rules: `.claude/rules/`.
