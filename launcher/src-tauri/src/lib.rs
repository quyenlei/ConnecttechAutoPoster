//! Connecttech launcher: installs and updates Connecttech Auto Poster (CAP), either in its own Chrome for Testing
//! window or in the user's Chrome. See docs/superpowers/specs/2026-11-11-connecttech-launcher-design.md.

pub mod browser;
pub mod install;
pub mod release;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
