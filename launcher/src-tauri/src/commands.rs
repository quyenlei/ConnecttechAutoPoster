//! Tauri commands and events: the UI calls these; progress and status changes come back as events.

use crate::browser::{self, BrowserBuild};
use crate::install::{fetch_release, install_release, installed_version};
use crate::release::{is_newer, ErrorCode, Release, UPDATE_JSON_URL};
use crate::state::{decide, extension_dir, load_settings, save_settings, Action, Mode, Settings};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

/// Checks run when the app starts and then at most once a day while it stays open.
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

pub struct AppState {
    data: PathBuf,
    client: reqwest::Client,
    settings: Mutex<Settings>,
    child: Mutex<Option<Child>>,
    /// A CAP release or browser build waiting for the launcher's browser to close.
    pending: Mutex<Pending>,
    latest: Mutex<Option<String>>,
    error: Mutex<Option<String>>,
    busy: Mutex<bool>,
    /// A watcher waits for the launcher's browser to close (at most one).
    watching: Mutex<bool>,
    /// Tests against a local mock only (CAP_LAUNCHER_TEST=1): allows http://127.0.0.1 and other URLs.
    test: bool,
}

#[derive(Default)]
struct Pending {
    cap: Option<Release>,
    browser: Option<BrowserBuild>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    mode: Option<Mode>,
    platform_supported: bool,
    cap_version: Option<String>,
    browser_version: Option<String>,
    browser_running: bool,
    pending_update: Option<String>,
    extension_path: String,
    latest: Option<String>,
    app_version: String,
    app_update: bool,
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
            child: Mutex::default(),
            pending: Mutex::default(),
            latest: Mutex::default(),
            error: Mutex::default(),
            busy: Mutex::new(false),
            watching: Mutex::new(false),
            test,
        }
    }

    fn mode(&self) -> Option<Mode> {
        self.settings.lock().unwrap().mode
    }

    /// The launcher's browser is open: the one this session started, or one still open from an earlier session
    /// (found by its program living in `<data>/browser`).
    fn running(&self) -> bool {
        let mine = {
            let mut child = self.child.lock().unwrap();
            match child.as_mut().map(|c| c.try_wait()) {
                Some(Ok(None)) => true,
                Some(_) => {
                    *child = None;
                    false
                }
                None => false,
            }
        };
        mine || browser::browser_process_running(&self.data)
    }

    fn update_json_url(&self) -> String {
        std::env::var("CAP_UPDATE_MANIFEST_URL").ok().filter(|_| self.test).unwrap_or_else(|| UPDATE_JSON_URL.into())
    }

    fn index_url(&self) -> String {
        std::env::var("CAP_BROWSER_INDEX_URL").ok().filter(|_| self.test).unwrap_or_else(|| browser::INDEX_URL.into())
    }

    fn log(&self, line: &str) {
        let _ = std::fs::create_dir_all(&self.data);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(self.data.join("launcher.log")) {
            let _ = writeln!(f, "{} {line}", now());
        }
    }

    fn status(&self, app: &AppHandle) -> Status {
        let mode = self.mode();
        let ext = extension_dir(&self.data, mode.unwrap_or(Mode::Chrome));
        let pending = self.pending.lock().unwrap();
        let latest = self.latest.lock().unwrap().clone();
        let app_version = app.package_info().version.to_string();
        Status {
            mode,
            platform_supported: platform().is_some(),
            cap_version: installed_version(&ext),
            browser_version: browser::installed_browser_version(&self.data),
            browser_running: self.running(),
            pending_update: pending.cap.as_ref().map(|r| r.version.clone()).or(pending.browser.as_ref().map(|_| String::new())),
            extension_path: ext.display().to_string(),
            app_update: latest.as_deref().is_some_and(|l| is_newer(l, &app_version)),
            latest,
            app_version,
            busy: *self.busy.lock().unwrap(),
            error: self.error.lock().unwrap().clone(),
        }
    }
}

fn platform() -> Option<&'static str> {
    browser::platform_key(std::env::consts::OS, std::env::consts::ARCH)
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn emit_status(app: &AppHandle) {
    let state = app.state::<AppState>();
    let _ = app.emit("status", state.status(app));
}

fn progress(app: &AppHandle, item: &'static str) -> impl Fn(u64, Option<u64>) + use<> {
    let app = app.clone();
    move |done, total| {
        let _ = app.emit("progress", Progress { item, done, total });
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

async fn fetch_browser_build(state: &AppState) -> Result<BrowserBuild, ErrorCode> {
    let platform = platform().ok_or(ErrorCode::Manifest)?;
    let response = state.client.get(state.index_url()).timeout(Duration::from_secs(30)).send().await.map_err(|_| ErrorCode::Network)?;
    if !response.status().is_success() {
        return Err(ErrorCode::Network);
    }
    let body = response.text().await.map_err(|_| ErrorCode::Network)?;
    browser::parse_index(&body, platform, state.test).ok_or(ErrorCode::Manifest)
}

async fn apply_browser(app: &AppHandle, build: &BrowserBuild) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let platform = platform().ok_or(ErrorCode::Manifest)?;
    browser::install_browser(&state.client, build, platform, &state.data, state.test, progress(app, "browser")).await.map(|_| ())
}

async fn apply_cap(app: &AppHandle, release: &Release, mode: Mode) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let target = extension_dir(&state.data, mode);
    install_release(&state.client, release, &state.data.join("staging"), &target, progress(app, "cap")).await.map(|_| ())
}

/// Checks both CAP and (mode 1) the browser, applying what may be applied now and keeping the rest pending.
async fn check_and_apply(app: &AppHandle) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let mode = state.mode().ok_or(ErrorCode::Manifest)?;
    let release = fetch_release(&state.client, &state.update_json_url(), state.test).await?;
    *state.latest.lock().unwrap() = Some(release.version.clone());
    let running = state.running();
    let installed = installed_version(&extension_dir(&state.data, mode));
    match decide(mode, running, installed.as_deref(), &release.version) {
        Action::Apply => apply_cap(app, &release, mode).await?,
        Action::Defer => state.pending.lock().unwrap().cap = Some(release),
        Action::Nothing => {}
    }
    if mode == Mode::Browser {
        // A browser problem must not block CAP updates; it only fails the check when there is no browser yet.
        let have = browser::installed_browser_version(&state.data);
        let browser = async {
            let build = fetch_browser_build(&state).await?;
            if have.as_deref() != Some(build.version.as_str()) {
                if running {
                    state.pending.lock().unwrap().browser = Some(build);
                } else {
                    apply_browser(app, &build).await?;
                }
            }
            Ok::<(), ErrorCode>(())
        }
        .await;
        if let Err(code) = browser {
            if have.is_none() {
                return Err(code);
            }
            state.log(&format!("browser update: {}", code.as_str()));
        }
        if running {
            watch_browser(app.clone());
        }
    }
    // Only a check that went through counts; a failed one is retried by the next background round.
    let mut settings = state.settings.lock().unwrap();
    settings.last_check = now();
    let _ = save_settings(&state.data, &settings);
    Ok(())
}

/// Applies what waited for the launcher's browser to close.
async fn apply_pending(app: &AppHandle) -> Result<(), ErrorCode> {
    let state = app.state::<AppState>();
    let (cap, build) = {
        let mut pending = state.pending.lock().unwrap();
        (pending.cap.take(), pending.browser.take())
    };
    let mut result = Ok(());
    if let Some(build) = build {
        if let Err(code) = apply_browser(app, &build).await {
            state.pending.lock().unwrap().browser = Some(build);
            result = Err(code);
        }
    }
    if let Some(release) = cap {
        if let Err(code) = apply_cap(app, &release, Mode::Browser).await {
            state.pending.lock().unwrap().cap = Some(release);
            result = result.and(Err(code));
        }
    }
    result
}

#[tauri::command]
pub fn get_status(app: AppHandle, state: State<'_, AppState>) -> Status {
    state.status(&app)
}

#[tauri::command]
pub fn set_mode(app: AppHandle, state: State<'_, AppState>, mode: Mode) -> Result<Status, String> {
    {
        let mut settings = state.settings.lock().unwrap();
        settings.mode = Some(mode);
        save_settings(&state.data, &settings).map_err(|_| "folder".to_string())?;
    }
    state.log(&format!("mode: {mode:?}"));
    Ok(state.status(&app))
}

/// First install for the chosen mode, and the "Kiểm tra cập nhật" button.
#[tauri::command]
pub async fn check_updates(app: AppHandle) -> Result<(), String> {
    guarded(&app, "update", check_and_apply(&app)).await
}

#[tauri::command]
pub async fn launch_browser(app: AppHandle) -> Result<(), String> {
    let launch = async {
        let state = app.state::<AppState>();
        if state.running() {
            return Ok(());
        }
        if let Err(code) = apply_pending(&app).await {
            state.log(&format!("pending update: {}", code.as_str()));
        }
        let version = browser::installed_browser_version(&state.data).ok_or(ErrorCode::Folder)?;
        let platform = platform().ok_or(ErrorCode::Manifest)?;
        let exe = browser::executable_path(&state.data.join("browser").join(version), platform);
        let child = std::process::Command::new(exe)
            .args(browser::launch_args(&state.data))
            .spawn()
            .map_err(|_| ErrorCode::Folder)?;
        *state.child.lock().unwrap() = Some(child);
        watch_browser(app.clone());
        Ok(())
    };
    guarded(&app, "launch", launch).await
}

/// When the launcher's browser closes, apply any pending update and tell the UI.
fn watch_browser(app: AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut watching = state.watching.lock().unwrap();
        if *watching {
            return;
        }
        *watching = true;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            if !app.state::<AppState>().running() {
                break;
            }
        }
        *app.state::<AppState>().watching.lock().unwrap() = false;
        let has_pending = {
            let state = app.state::<AppState>();
            let pending = state.pending.lock().unwrap();
            pending.cap.is_some() || pending.browser.is_some()
        };
        if has_pending {
            let _ = guarded(&app, "update", apply_pending(&app)).await;
        } else {
            emit_status(&app);
        }
    });
}

/// Starts the user's own Chrome (mode 2). Chrome refuses chrome:// addresses from outside, so the UI copies
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

/// Startup: check if a mode is chosen and the last check is a day old, then every day while open.
pub fn start_background_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let due = {
                let state = app.state::<AppState>();
                let settings = state.settings.lock().unwrap();
                let installed = settings.mode.is_some_and(|m| installed_version(&extension_dir(&state.data, m)).is_some());
                installed && now().saturating_sub(settings.last_check) >= CHECK_EVERY.as_secs()
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
