# Connecttech app changelog

The desktop app in `launcher/` (Tauri). Released on its own as `app-v<version>` when a merge into `main` carries a
new version here (`launcher/package.json` and `src-tauri/Cargo.toml`). CAP's changes are in `../CHANGELOG.md`.

## [Unreleased]

## [1.1.0] - 2026-11-11

### Added
- **Keep the CAP you already use up to date.** In "Chrome có sẵn", the new **Chọn thư mục CAP đang dùng** button lets you pick the folder Chrome already loads CAP from (shown as *Loaded from* in CAP's details on `chrome://extensions`). The app then updates that folder directly: no removing, no Load unpacked again, data stays, and CAP (0.8.0 or later) reloads itself into the new version when no run is active (it checks hourly; ⟳ on its card in `chrome://extensions` applies it at once). Only a folder whose `manifest.json` is Connecttech Auto Poster is accepted, because updating replaces every file in it.
- Verified: CAP 0.8.0 running in Chrome for Testing with Developer mode, its folder replaced by 1.0.0, reloads itself into 1.0.0.

## [1.0.0] - 2026-11-11

### Added
- First version released on its own. Two ways to use CAP: **Trình duyệt riêng** (the app downloads Chrome for Testing and starts it with CAP loaded) or **Chrome có sẵn** (one guided Load unpacked). Installs and updates CAP from `update.json`, checks SHA-256 and version, never replaces the files of its own browser while it runs.
- "Có bản app mới" now compares with the app's own latest version (`app` in `update.json`), not CAP's.
- Same features as the app shipped with CAP 0.8.0–0.8.2, including the ad-hoc signed macOS bundle and the working **Tôi đã làm xong** button.
