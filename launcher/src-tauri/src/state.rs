//! The launcher's own settings (`<data>/settings.json`) and which CAP folder it keeps up to date.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Unix seconds of the last update check.
    #[serde(default)]
    pub last_check: u64,
    /// The CAP folder Chrome already loads, chosen by the user, instead of the app's own.
    #[serde(default)]
    pub chrome_dir: Option<PathBuf>,
}

/// The folder the app keeps up to date: the one the user chose, else the app's own `<data>/chrome-extension`.
pub fn cap_dir(data: &Path, settings: &Settings) -> PathBuf {
    settings.chrome_dir.clone().unwrap_or_else(|| data.join("chrome-extension"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_the_folder_chrome_already_loads_when_one_was_chosen() {
        let data = Path::new("/data");
        let mut settings = Settings::default();
        assert_eq!(cap_dir(data, &settings), data.join("chrome-extension"));
        settings.chrome_dir = Some(PathBuf::from("/Users/me/CAP"));
        assert_eq!(cap_dir(data, &settings), PathBuf::from("/Users/me/CAP"));
    }

    #[test]
    fn settings_round_trip_and_default_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(dir.path()), Settings::default());
        let settings = Settings { last_check: 42, chrome_dir: Some(PathBuf::from("/x")) };
        save_settings(dir.path(), &settings).unwrap();
        assert_eq!(load_settings(dir.path()), settings);
    }

    #[test]
    fn reads_settings_written_by_app_1_0_with_a_mode() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), r#"{"mode":"browser","lastCheck":7}"#).unwrap();
        assert_eq!(load_settings(dir.path()), Settings { last_check: 7, chrome_dir: None });
    }
}
