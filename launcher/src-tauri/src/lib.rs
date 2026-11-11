//! Connecttech launcher: installs and updates Connecttech Auto Poster (CAP), either in its own Chrome for Testing
//! window or in the user's Chrome. See docs/superpowers/specs/2026-11-11-connecttech-launcher-design.md.

pub mod browser;
mod commands;
pub mod install;
pub mod release;
pub mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = commands::data_dir(app.handle());
            app.manage(commands::AppState::new(data));
            commands::start_background_checks(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::set_mode,
            commands::check_updates,
            commands::launch_browser,
            commands::open_chrome,
            commands::open_data_folder,
            commands::read_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
