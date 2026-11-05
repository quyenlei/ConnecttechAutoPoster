---
paths:
  - "src/ui/**/*.scss"
  - "src/ui/**/*.tsx"
---

# Styling and accessibility rules

- SCSS only, partials under `src/ui/styles/{abstracts,base,components,layout,pages}`, registered in `app.scss`.
- Naming: `block`, `block__element`, `block__element-sub-element`, `block__element--modifier`. Prefer `campaigns__list-item` over `campaigns-list__item`. Avoid generic names without a block prefix.
- Nest at most one level (`&__x`, `&--y`, `&:hover`). Use `@include laptop/tablet/mobile` (desktop-first, max-width).
- Units: `rem` for spacing, type, sizes, radius; `px` for borders and 1px details. Reuse `$space-*` and CSS variables; add colors as variables with a dark-mode value.
- No `!important`, no ID selectors, no inline styles, no Tailwind/Bootstrap.
- Every input has a `<label>`; icon-only controls have `aria-label`; keep `:focus-visible` outlines; use `role="alert"` only for real errors.
- Status is never color-only: always include the text label.
