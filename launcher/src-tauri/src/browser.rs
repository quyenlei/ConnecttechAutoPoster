//! Chrome for Testing (mode 1): picks Google's official build for this computer, downloads it into the launcher's
//! data folder and starts it with CAP loaded. One profile, owned by the launcher; no other flags.

use crate::release::ErrorCode;
use std::path::{Path, PathBuf};

/// Google's list of current Chrome for Testing builds.
pub const INDEX_URL: &str =
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
/// The only place a browser zip may come from.
pub const DOWNLOAD_PREFIX: &str = "https://storage.googleapis.com/chrome-for-testing-public/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserBuild {
    pub version: String,
    pub url: String,
}

/// Chrome for Testing's platform name for `std::env::consts::{OS, ARCH}`; None when Google has no build.
pub fn platform_key(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("windows", "x86_64") => Some("win64"),
        ("windows", "x86") => Some("win32"),
        ("macos", "aarch64") => Some("mac-arm64"),
        ("macos", "x86_64") => Some("mac-x64"),
        ("linux", "x86_64") => Some("linux64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        _ => None,
    }
}

fn allowed(url: &str, allow_http: bool) -> bool {
    url.starts_with(DOWNLOAD_PREFIX) || (allow_http && url.starts_with("http://127.0.0.1:"))
}

/// The Stable build for `platform` from Google's index, if its URL is on Google's download host.
pub fn parse_index(json: &str, platform: &str, allow_http: bool) -> Option<BrowserBuild> {
    let index: serde_json::Value = serde_json::from_str(json).ok()?;
    let stable = index.get("channels")?.get("Stable")?;
    let version = stable.get("version")?.as_str()?.to_string();
    let url = stable
        .get("downloads")?
        .get("chrome")?
        .as_array()?
        .iter()
        .find(|d| d.get("platform").and_then(|p| p.as_str()) == Some(platform))?
        .get("url")?
        .as_str()?
        .to_string();
    allowed(&url, allow_http).then_some(BrowserBuild { version, url })
}

/// The browser executable inside `<data>/browser/<version>`.
pub fn executable_path(browser_dir: &Path, platform: &str) -> PathBuf {
    let folder = browser_dir.join(format!("chrome-{platform}"));
    if platform.starts_with("mac") {
        folder.join("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
    } else if platform.starts_with("win") {
        folder.join("chrome.exe")
    } else {
        folder.join("chrome")
    }
}

/// Version of the browser in `<data>/browser`, if one is installed.
pub fn installed_browser_version(data: &Path) -> Option<String> {
    std::fs::read_dir(data.join("browser"))
        .ok()?
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .find(|name| !name.ends_with(".part"))
}

/// Downloads and unpacks `build` into `<data>/browser/<version>`, removes older versions, returns the executable.
pub async fn install_browser(
    client: &reqwest::Client,
    build: &BrowserBuild,
    platform: &str,
    data: &Path,
    allow_http: bool,
    progress: impl Fn(u64, Option<u64>),
) -> Result<PathBuf, ErrorCode> {
    if !allowed(&build.url, allow_http) {
        return Err(ErrorCode::Manifest);
    }
    let staging = data.join("staging");
    std::fs::create_dir_all(&staging).map_err(|_| ErrorCode::Folder)?;
    let zip = staging.join("browser.zip");
    let result = async {
        crate::install::download(client, &build.url, &zip, &progress).await?;
        let browsers = data.join("browser");
        let part = browsers.join(format!("{}.part", build.version));
        let _ = std::fs::remove_dir_all(&part);
        crate::install::extract(&zip, &part).map_err(|_| ErrorCode::Archive)?;
        if !executable_path(&part, platform).exists() {
            return Err(ErrorCode::Archive);
        }
        #[cfg(target_os = "macos")]
        {
            // Google signs the app; only the download flag would make Gatekeeper ask.
            let _ = std::process::Command::new("xattr").args(["-dr", "com.apple.quarantine"]).arg(&part).status();
        }
        let done = browsers.join(&build.version);
        let _ = std::fs::remove_dir_all(&done);
        std::fs::rename(&part, &done).map_err(|_| ErrorCode::Folder)?;
        for entry in std::fs::read_dir(&browsers).map_err(|_| ErrorCode::Folder)?.flatten() {
            if entry.path() != done {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
        Ok(executable_path(&done, platform))
    }
    .await;
    let _ = std::fs::remove_file(&zip);
    result
}

/// True when any process runs a program from `<data>/browser` (the launcher's browser, whoever started it).
pub fn browser_process_running(data: &Path) -> bool {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    // Compare with both spellings of the folder (macOS reports /var/... for /private/var/...).
    let root = data.join("browser");
    let real = root.canonicalize().unwrap_or_else(|_| root.clone());
    let Ok(mut system) = System::new() else { return false };
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::Always));
    system.processes().values().any(|p| p.exe().is_some_and(|exe| exe.starts_with(&root) || exe.starts_with(&real)))
}

/// The exact arguments the browser is started with.
pub fn launch_args(data: &Path) -> Vec<String> {
    vec![
        format!("--user-data-dir={}", data.join("profile").display()),
        format!("--load-extension={}", data.join("extension").display()),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        "https://www.facebook.com/".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::install::tests::Mock;
    use std::io::Write;

    const INDEX: &str = include_str!("../tests/fixtures/cft-index.json");

    #[test]
    fn maps_this_computer_to_a_google_build() {
        assert_eq!(platform_key("windows", "x86_64"), Some("win64"));
        assert_eq!(platform_key("windows", "x86"), Some("win32"));
        assert_eq!(platform_key("macos", "aarch64"), Some("mac-arm64"));
        assert_eq!(platform_key("macos", "x86_64"), Some("mac-x64"));
        assert_eq!(platform_key("linux", "x86_64"), Some("linux64"));
        assert_eq!(platform_key("linux", "aarch64"), Some("linux-arm64"));
        assert_eq!(platform_key("windows", "aarch64"), None, "no Windows on Arm build");
        assert_eq!(platform_key("freebsd", "x86_64"), None);
    }

    #[test]
    fn reads_the_stable_build_from_the_index() {
        let build = parse_index(INDEX, "mac-arm64", false).unwrap();
        assert_eq!(build.version, "157.0.8103.50");
        assert_eq!(build.url, "https://storage.googleapis.com/chrome-for-testing-public/157.0.8103.50/mac-arm64/chrome-mac-arm64.zip");
        assert!(parse_index(INDEX, "win-arm64", false).is_none());
    }

    #[test]
    fn refuses_a_build_from_another_host() {
        let evil = INDEX.replace("https://storage.googleapis.com/chrome-for-testing-public/", "https://evil.example/");
        assert!(parse_index(&evil, "mac-arm64", false).is_none());
        assert!(parse_index("not json", "mac-arm64", false).is_none());
    }

    #[test]
    fn knows_where_the_executable_is() {
        let dir = Path::new("/data/browser/157.0.8103.50");
        assert_eq!(executable_path(dir, "mac-arm64"), dir.join("chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"));
        assert_eq!(executable_path(dir, "win64"), dir.join("chrome-win64/chrome.exe"));
        assert_eq!(executable_path(dir, "linux64"), dir.join("chrome-linux64/chrome"));
    }

    #[test]
    fn starts_with_one_profile_cap_and_nothing_else() {
        let data = Path::new("/data");
        assert_eq!(
            launch_args(data),
            vec![
                format!("--user-data-dir={}", data.join("profile").display()),
                format!("--load-extension={}", data.join("extension").display()),
                "--no-first-run".to_string(),
                "--no-default-browser-check".to_string(),
                "https://www.facebook.com/".to_string(),
            ]
        );
    }

    #[tokio::test]
    async fn installs_a_build_and_removes_older_ones() {
        let mock = Mock::start();
        let mut out = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut out);
            let opts = zip::write::SimpleFileOptions::default().unix_permissions(0o755);
            z.start_file("chrome-linux64/chrome", opts).unwrap();
            z.write_all(b"#!/bin/sh\n").unwrap();
            z.finish().unwrap();
        }
        mock.put("/158.0.0.1/linux64/chrome-linux64.zip", out.into_inner());
        let data = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(data.path().join("browser/157.0.8103.50")).unwrap();
        let build = BrowserBuild { version: "158.0.0.1".into(), url: format!("{}/158.0.0.1/linux64/chrome-linux64.zip", mock.base) };

        let exe = install_browser(&reqwest::Client::new(), &build, "linux64", data.path(), true, |_, _| {}).await.unwrap();
        assert_eq!(exe, data.path().join("browser/158.0.0.1/chrome-linux64/chrome"));
        assert!(exe.exists());
        assert_eq!(installed_browser_version(data.path()).as_deref(), Some("158.0.0.1"));
        assert!(!data.path().join("browser/157.0.8103.50").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_ne!(std::fs::metadata(&exe).unwrap().permissions().mode() & 0o111, 0, "executable");
        }
    }

    /// The launcher may have been restarted while its browser stayed open: find that browser by where its program
    /// lives (inside `<data>/browser`), without reading the profile.
    #[cfg(unix)]
    #[test]
    fn notices_a_browser_started_by_an_earlier_launcher() {
        let data = tempfile::tempdir().unwrap();
        let bin = data.path().join("browser/158.0.0.1/chrome-linux64");
        std::fs::create_dir_all(&bin).unwrap();
        let program = bin.join("chrome");
        // A freshly built program (macOS kills copies of signed system binaries such as /bin/sleep).
        let source = data.path().join("wait.c");
        std::fs::write(&source, "#include <unistd.h>\nint main(void){sleep(30);return 0;}\n").unwrap();
        assert!(std::process::Command::new("cc").arg(&source).arg("-o").arg(&program).status().unwrap().success());
        assert!(!browser_process_running(data.path()));

        let mut child = std::process::Command::new(&program).arg("30").spawn().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let seen = browser_process_running(data.path());
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(seen, "a browser running from <data>/browser is noticed");
        assert!(!browser_process_running(data.path()));
    }

    #[tokio::test]
    async fn refuses_a_download_url_off_googles_host() {
        let data = tempfile::tempdir().unwrap();
        let build = BrowserBuild { version: "158.0.0.1".into(), url: "https://evil.example/chrome.zip".into() };
        let result = install_browser(&reqwest::Client::new(), &build, "linux64", data.path(), false, |_, _| {}).await;
        assert_eq!(result, Err(ErrorCode::Manifest));
    }
}
