//! Tauri commands and events: the UI calls these; progress and status changes come back as events.
//! The app keeps one CAP folder up to date for the user's own Chrome: the folder Chrome already loads (chosen by
//! the user) or the app's own `<data>/chrome-extension`. CAP reloads itself when that folder holds a newer version.

use crate::install::{fetch_text, install_release, installed_version, is_cap_folder};
use crate::release::{is_newer, parse_app_latest, parse_release, ErrorCode, UPDATE_JSON_URL};
use crate::state::{cap_dir, load_settings, save_settings, Settings};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

/// Checks run when the app starts and then at most once a day while it stays open.
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

pub struct AppState {
    data: PathBuf,
    client: reqwest::Client,
    settings: Mutex<Settings>,
    latest: Mutex<Option<String>>,
    /// The app's own latest version and release page (`app` in update.json).
    app_latest: Mutex<Option<(String, String)>>,
    error: Mutex<Option<String>>,
    busy: Mutex<bool>,
    /// Tests against a local mock only (CAP_LAUNCHER_TEST=1): allows http://127.0.0.1 and another update.json URL.
    test: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    cap_version: Option<String>,
    extension_path: String,
    /// The user chose the folder Chrome already loads (else the app's own folder).
    custom_folder: bool,
    latest: Option<String>,
    app_version: String,
    app_update: bool,
    app_page_url: Option<String>,
    busy: bool,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    item: &'static str,
    done: u64,
    total: Option<u64>,
}

impl AppState {
    pub fn new(data: PathBuf) -> AppState {
        let test = std::env::var("CAP_LAUNCHER_TEST").as_deref() == Ok("1");
        let client = reqwest::Client::builder()
            .user_agent(concat!("ConnecttechLauncher/", env!("CARGO_PKG_VERSION")))
            .https_only(!test)
            .build()
            .expect("http client");
        AppState {
            settings: Mutex::new(load_settings(&data)),
            data,
            client,
            latest: Mutex::default(),
            app_latest: Mutex::default(),
            error: Mutex::default(),
            busy: Mutex::new(false),
            test,
        }
    }

    fn target_dir(&self) -> PathBuf {
        cap_dir(&self.data, &self.settings.lock().unwrap())
    }

    fn update_json_url(&self) -> String {
        std::env::var("CAP_UPDATE_MANIFEST_URL").ok().filter(|_| self.test).unwrap_or_else(|| UPDATE_JSON_URL.into())
    }

    fn log(&self, line: &str) {
        let _ = std::fs::create_dir_all(&self.data);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(self.data.join("launcher.log")) {
            let _ = writeln!(f, "{} {line}", now());
        }
    }

    fn status(&self, app: &AppHandle) -> Status {
        let ext = self.target_dir();
        let app_version = app.package_info().version.to_string();
        let app_latest = self.app_latest.lock().unwrap().clone();
        Status {
            cap_version: installed_version(&ext),
            extension_path: ext.display().to_string(),
            custom_folder: self.settings.lock().unwrap().chrome_dir.is_some(),
            latest: self.latest.lock().unwrap().clone(),
            app_update: app_latest.as_ref().is_some_and(|(v, _)| is_newer(v, &app_version)),
            app_page_url: app_latest.map(|(_, page)| page),
            app_version,
            busy: *self.busy.lock().unwrap(),
            error: self.error.lock().unwrap().clone(),
        }
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn emit_status(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _ = app.emit("status", state.status(app));
}

fn progress(app: &AppHandle) -> impl Fn(u64, Option<u64>) + use<> {
    let app = app.clone();
    move |done, total| {
        let _ = app.emit("progress", Progress { item: "cap", done, total });
    }
}

/// Runs `work` with the busy flag set and the error cleared; records the error code it returns.
async fn guarded<F>(app: &AppHandle, what: &str, work: F) -> Result<(), String>
where
    F: std::future::Future<Output = Result<(), ErrorCode>>,
{
    let state = app.state::<AppState>();
    {
        let mut busy = state.busy.lock().unwrap();
        if *busy {
            return Err("busy".into());
        }
        *busy = true;
    }
    *state.error.lock().unwrap() = None;
    emit_status(app);
    let result = work.await;
    *state.busy.lock().unwrap() = false;
    match &result {
        Ok(()) => state.log(&format!("{what}: ok")),
        Err(code) => {
            state.log(&format!("{what}: {}", code.as_str()));
            *state.error.lock().unwrap() = Some(code.as_str().into());
        }
    }
    emit_status(app);
    result.map_err(|code| code.as_str().to_string())
}

/// Reads update.json and brings the CAP folder to the announced version (nothing when it is already there).
async fn check_and_apply(app: &AppHandle) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let body = fetch_text(&state.client, &state.update_json_url()).await?;
    *state.app_latest.lock().unwrap() = parse_app_latest(&body);
    let release = parse_release(&body, state.test)?;
    *state.latest.lock().unwrap() = Some(release.version.clone());
    let target = state.target_dir();
    let installed = installed_version(&target);
    if installed.as_deref().is_none_or(|current| is_newer(&release.version, current)) {
        install_release(&state.client, &release, &state.data.join("staging"), &target, progress(app)).await?;
    }
    // Only a check that went through counts; a failed one is retried by the next background round.
    let mut settings = state.settings.lock().unwrap();
    settings.last_check = now();
    let _ = save_settings(&state.data, &settings);
    Ok(())
}

#[tauri::command]
pub fn get_status(app: AppHandle, state: State<'_, AppState>) -> Status {
    state.status(&app)
}

/// First install and the "Kiểm tra cập nhật" button.
#[tauri::command]
pub async fn check_updates(app: AppHandle) -> Result<(), String> {
    guarded(&app, "update", check_and_apply(&app)).await
}

/// Keep the CAP folder Chrome already loads up to date, instead of the app's own folder. Only a folder holding
/// CAP is accepted, because updating replaces every file in it.
#[tauri::command]
pub fn use_cap_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Status, String> {
    let dir = PathBuf::from(path);
    if !is_cap_folder(&dir) {
        return Err("not-cap".into());
    }
    {
        let mut settings = state.settings.lock().unwrap();
        settings.chrome_dir = Some(dir.clone());
        save_settings(&state.data, &settings).map_err(|_| "folder".to_string())?;
    }
    state.log(&format!("cap folder: {}", dir.display()));
    Ok(state.status(&app))
}

/// Starts the user's Chrome. Chrome refuses chrome:// addresses from outside, so the UI copies
/// `chrome://extensions` for the user to paste.
#[tauri::command]
pub fn open_chrome() -> Result<(), String> {
    let started = if cfg!(target_os = "macos") {
        std::process::Command::new("open").args(["-a", "Google Chrome"]).status().is_ok_and(|s| s.success())
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("cmd").args(["/C", "start", "", "chrome"]).status().is_ok_and(|s| s.success())
    } else {
        ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
            .iter()
            .any(|name| std::process::Command::new(name).spawn().is_ok())
    };
    if started { Ok(()) } else { Err("chrome-missing".into()) }
}

#[tauri::command]
pub fn open_data_folder(state: State<'_, AppState>) -> Result<(), String> {
    let _ = std::fs::create_dir_all(&state.data);
    tauri_plugin_opener::open_path(&state.data, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_log(state: State<'_, AppState>) -> String {
    let text = std::fs::read_to_string(state.data.join("launcher.log")).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(20)..].join("\n")
}

/// Once CAP is installed: check when the last check is a day old, looking again every hour while the app is open.
pub fn start_background_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let due = {
                let state = app.state::<AppState>();
                let installed = installed_version(&state.target_dir()).is_some();
                let last = state.settings.lock().unwrap().last_check;
                installed && now().saturating_sub(last) >= CHECK_EVERY.as_secs()
            };
            if due {
                let _ = guarded(&app, "update", check_and_apply(&app)).await;
            }
            tokio::time::sleep(Duration::from_secs(60 * 60)).await;
        }
    });
}

pub fn data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| Path::new(".").join("connecttech-data"))
}
