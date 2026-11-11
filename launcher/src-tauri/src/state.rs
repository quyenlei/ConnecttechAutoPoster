//! The launcher's own settings (`<data>/settings.json`) and the rule for when an update may be applied.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Chrome for Testing started by the launcher, CAP loaded automatically.
    Browser,
    /// The user's Chrome, CAP loaded once with Load unpacked.
    Chrome,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub mode: Option<Mode>,
    /// Unix seconds of the last update check.
    #[serde(default)]
    pub last_check: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Apply,
    Defer,
    Nothing,
}

/// Where CAP lives for `mode`. Separate folders, so one mode never replaces the other's files.
pub fn extension_dir(data: &Path, mode: Mode) -> PathBuf {
    match mode {
        Mode::Browser => data.join("extension"),
        Mode::Chrome => data.join("chrome-extension"),
    }
}

pub fn load_settings(data: &Path) -> Settings {
    std::fs::read_to_string(data.join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_settings(data: &Path, settings: &Settings) -> std::io::Result<()> {
    std::fs::create_dir_all(data)?;
    let text = serde_json::to_string(settings).map_err(std::io::Error::other)?;
    let tmp = data.join("settings.json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(tmp, data.join("settings.json"))
}

/// Whether to apply `latest` now. The launcher's own browser never gets files replaced while it runs (CAP could
/// not reload itself there); the user's Chrome does, and CAP reloads itself when idle.
pub fn decide(mode: Mode, browser_running: bool, installed: Option<&str>, latest: &str) -> Action {
    let newer = installed.is_none_or(|current| crate::release::is_newer(latest, current));
    match (newer, mode, browser_running) {
        (false, _, _) => Action::Nothing,
        (true, Mode::Browser, true) => Action::Defer,
        (true, _, _) => Action::Apply,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waits_while_the_launchers_browser_runs() {
        assert_eq!(decide(Mode::Browser, true, Some("0.7.5"), "0.7.6"), Action::Defer);
        assert_eq!(decide(Mode::Browser, false, Some("0.7.5"), "0.7.6"), Action::Apply);
    }

    #[test]
    fn updates_the_users_chrome_folder_at_once() {
        assert_eq!(decide(Mode::Chrome, true, Some("0.7.5"), "0.7.6"), Action::Apply);
        assert_eq!(decide(Mode::Chrome, false, Some("0.7.5"), "0.7.6"), Action::Apply);
    }

    #[test]
    fn does_nothing_when_up_to_date() {
        assert_eq!(decide(Mode::Browser, false, Some("0.7.6"), "0.7.6"), Action::Nothing);
        assert_eq!(decide(Mode::Chrome, false, Some("0.7.7"), "0.7.6"), Action::Nothing);
    }

    #[test]
    fn installs_when_nothing_is_there() {
        assert_eq!(decide(Mode::Chrome, false, None, "0.7.6"), Action::Apply);
        assert_eq!(decide(Mode::Browser, true, None, "0.7.6"), Action::Defer);
    }

    #[test]
    fn keeps_each_modes_extension_apart() {
        let data = Path::new("/data");
        assert_eq!(extension_dir(data, Mode::Browser), data.join("extension"));
        assert_eq!(extension_dir(data, Mode::Chrome), data.join("chrome-extension"));
    }

    #[test]
    fn settings_round_trip_and_default_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(dir.path()), Settings::default());
        let settings = Settings { mode: Some(Mode::Chrome), last_check: 42 };
        save_settings(dir.path(), &settings).unwrap();
        assert_eq!(load_settings(dir.path()), settings);
        let text = std::fs::read_to_string(dir.path().join("settings.json")).unwrap();
        assert!(text.contains(r#""mode":"chrome""#), "{text}");
    }
}
