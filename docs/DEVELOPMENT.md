# Development

## Requirements
Node 22+, pnpm, and (for the smoke test) Python 3 with `playwright` plus `chromium-browser`. Branded Google Chrome 137+ ignores `--load-extension`, so automated tests need Chromium or Chrome for Testing.

## Setup
```bash
pnpm install          # also runs `wxt prepare`
pnpm typecheck
pnpm test
pnpm build        # .output/chrome-mv3
```
Load `.output/chrome-mv3` as an unpacked extension for manual testing.

## Tests
| Layer | Tool | Command | Covers |
|---|---|---|---|
| Unit | Vitest (node) | `ppnpm test` | delay, groups, run-engine, csv |
| DOM | Vitest + happy-dom | `ppnpm test` | `fb-dom.ts` selectors and detection |
| Smoke | Playwright + Chromium | `ppnpm test:e2e` | full campaign via UI against a **local mock** group page |

The smoke test maps `www.facebook.com` to `127.0.0.1:8443` and all other hosts to NOT FOUND, so it **never contacts real Facebook**. Keep it that way. Never add tests that post to real groups.

## Updating selectors when Facebook changes
1. Reproduce on a throwaway account and one test group you own.
2. Inspect the composer, dialog textbox and Post button. Prefer `role` and `aria-label`; avoid generated class names.
3. Edit `HINTS` / finders in `src/lib/fb-dom.ts`; add a case to `tests/fb-dom.test.ts` and, if the flow changed, to `MOCK` in `e2e/smoke.py`.

## Debugging
- Worker logs: `chrome://extensions` → CAP → **service worker** → Inspect.
- Dashboard: open DevTools on the options tab.
- Storage: DevTools → Application → Extension storage → Local.

## Conventions
See [CLAUDE.md](../CLAUDE.md) and `.claude/rules/`. In short: strict TypeScript, logic in `lib/` with tests, SCSS BEM (`block__element-sub`), rem units, no `!important`, no new dependencies without a reason, minimal permissions.

## Release
1. Update `CHANGELOG.md`. Each `pnpm build` increments the patch version in `package.json` before building; the resulting manifest version is displayed in the dashboard and popup. A failed build also consumes a version number. `pnpm dev` and `pnpm zip` do not increment it.
2. `pnpm typecheck && pnpm test && ppnpm test:e2e`.
3. `pnpm zip` → `.output/*.zip` for the Chrome Web Store.
4. Review `docs/SAFETY_AND_PRIVACY.md` against any permission change (store review requires a justification per permission).
