---
paths:
  - "docs/**"
  - "README.md"
  - "CHANGELOG.md"
---

# Documentation rules

- Only document what exists and is verified. Mark unverified claims (especially anything about live Facebook).
- A user-visible change updates `CHANGELOG.md` and `docs/USER_GUIDE.md`; an architectural change updates `docs/ARCHITECTURE.md`; a permission or safety change updates `docs/SAFETY_AND_PRIVACY.md`; scope changes update `docs/ROADMAP.md`.
- Keep the version identical in `package.json` and `CHANGELOG.md`.
- Plain English, short sentences, descriptive link text.
