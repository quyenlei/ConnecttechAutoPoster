---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "tests/**"
---

# TypeScript / React rules

- `strict` and `noUncheckedIndexedAccess` are on. No `any`, no non-null `!` except on `document.getElementById('root')`.
- Logic goes in `src/lib` (pure, tested). Components stay thin: state, events, markup.
- Read/write state through `src/lib/storage.ts` items and `useItem`; do not use `localStorage`.
- Messages between contexts use the types and guards in `src/lib/messages.ts`; validate before acting.
- Background code must tolerate restarts: persist before awaiting long work; schedule with `chrome.alarms`.
- Always close tabs the extension opens (`finally`).
- No new dependency without a stated reason; prefer platform APIs.
- Add or update a Vitest test with every `lib` change. Run `pnpm typecheck && pnpm test`.
