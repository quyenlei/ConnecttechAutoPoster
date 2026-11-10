# Safety and compliance rules

- Keep every limit in `src/lib/limits.ts` and every transition in `src/lib/run-engine.ts`; do not duplicate or bypass them in UI or background code.
- UI inputs may suggest values but must be clamped by `clampDelay` / `LIMITS` before use.
- Do not add: fingerprint spoofing, proxy/account rotation, hidden or headless posting, mouse-movement faking (random paths, idle movement; a single hover on a post's time label to read it is allowed, see SAFETY_AND_PRIVACY), bulk member scraping, posting to profiles/pages/Marketplace.
- Never log or persist post text beyond the user's own campaigns; logs contain group name, status and a short reason only.
- Any new automatic behavior that touches Facebook must be opt-in, visible in the UI, and documented in `docs/SAFETY_AND_PRIVACY.md`.
- Tests must never contact real Facebook. The e2e DNS rule (`MAP * ~NOTFOUND`) stays.
