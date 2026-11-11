//! Reads `update.json` (written by the release workflow on the `update` branch) and checks it with the same rules
//! as the script helper in `updater/`: plain version, zip only from CAP's releases on github.com, SHA-256 required.

/// The release file CAP and the launcher read.
pub const UPDATE_JSON_URL: &str =
    "https://raw.githubusercontent.com/quyenlei/ConnecttechAutoPoster/update/update.json";
/// The only place a CAP zip may come from.
pub const RELEASE_PREFIX: &str = "https://github.com/quyenlei/ConnecttechAutoPoster/releases/download/";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Release {
    pub version: String,
    pub zip_url: String,
    pub sha256: String,
}

/// Why an install or update did not happen. Same codes as the script helper, so CAP's texts still apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    Network,
    Manifest,
    ChecksumMissing,
    Checksum,
    Archive,
    Folder,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::Network => "network",
            ErrorCode::Manifest => "manifest",
            ErrorCode::ChecksumMissing => "checksum-missing",
            ErrorCode::Checksum => "checksum",
            ErrorCode::Archive => "archive",
            ErrorCode::Folder => "folder",
        }
    }
}

/// Validates `update.json`. `allow_http` is for tests against a local mock only.
pub fn parse_release(json: &str, allow_http: bool) -> Result<Release, ErrorCode> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Raw {
        version: Option<String>,
        zip_url: Option<String>,
        sha256: Option<String>,
    }
    let raw: Raw = serde_json::from_str(json).map_err(|_| ErrorCode::Network)?;
    let version = raw.version.unwrap_or_default();
    let zip_url = raw.zip_url.unwrap_or_default();
    let from_release = zip_url.starts_with(RELEASE_PREFIX)
        || (allow_http && zip_url.starts_with("http://127.0.0.1:") && zip_url.contains("/releases/download/"));
    let plain = !zip_url.is_empty() && zip_url.chars().all(|c| c.is_ascii_alphanumeric() || "._/:-".contains(c));
    if parse_version(&version).is_none() || !from_release || !plain {
        return Err(ErrorCode::Manifest);
    }
    let sha256 = raw.sha256.unwrap_or_default().to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ErrorCode::ChecksumMissing);
    }
    Ok(Release { version, zip_url, sha256 })
}

fn parse_version(text: &str) -> Option<[u64; 3]> {
    let parts: Vec<&str> = text.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_digit())) {
        return None;
    }
    Some([parts[0].parse().ok()?, parts[1].parse().ok()?, parts[2].parse().ok()?])
}

/// The app's own latest version and release page (`app` in update.json, written by scripts/release-app.mjs).
pub fn parse_app_latest(json: &str) -> Option<(String, String)> {
    let body: serde_json::Value = serde_json::from_str(json).ok()?;
    let app = body.get("app")?;
    let version = app.get("version")?.as_str()?;
    let page = app.get("pageUrl")?.as_str()?;
    parse_version(version)?;
    page.starts_with("https://github.com/").then(|| (version.to_string(), page.to_string()))
}

/// True when `latest` is a higher x.y.z than `current`. Unparsable versions are never newer.
pub fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(a), Some(b)) => a > b,
        (Some(_), None) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA: &str = "6EBE5489C77F70C74CBF9FA0DCC30CBF51496C16F0253E9021DA73D4B324A486";

    fn json(version: &str, zip: &str, sha: Option<&str>) -> String {
        let sha = sha.map(|s| format!(r#","sha256":"{s}""#)).unwrap_or_default();
        format!(r#"{{"version":"{version}","pageUrl":"https://github.com/x","zipUrl":"{zip}"{sha}}}"#)
    }

    fn zip(version: &str) -> String {
        format!("{RELEASE_PREFIX}v{version}/connecttech-auto-poster-{version}-chrome.zip")
    }

    #[test]
    fn accepts_a_release_and_lowercases_the_checksum() {
        let r = parse_release(&json("0.7.5", &zip("0.7.5"), Some(SHA)), false).unwrap();
        assert_eq!(r.version, "0.7.5");
        assert_eq!(r.zip_url, zip("0.7.5"));
        assert_eq!(r.sha256, SHA.to_lowercase());
    }

    #[test]
    fn refuses_a_zip_outside_the_cap_releases() {
        assert_eq!(parse_release(&json("0.7.5", "https://evil.example/cap.zip", Some(SHA)), false), Err(ErrorCode::Manifest));
    }

    #[test]
    fn refuses_a_version_that_is_not_x_y_z() {
        assert_eq!(parse_release(&json("1.2", &zip("1.2"), Some(SHA)), false), Err(ErrorCode::Manifest));
        assert_eq!(parse_release(&json("1.2.3-beta", &zip("1.2.3"), Some(SHA)), false), Err(ErrorCode::Manifest));
    }

    #[test]
    fn refuses_odd_characters_in_the_zip_url() {
        let bad = format!("{RELEASE_PREFIX}v0.7.5/cap 1.zip");
        assert_eq!(parse_release(&json("0.7.5", &bad, Some(SHA)), false), Err(ErrorCode::Manifest));
    }

    #[test]
    fn refuses_a_missing_or_malformed_checksum() {
        assert_eq!(parse_release(&json("0.7.5", &zip("0.7.5"), None), false), Err(ErrorCode::ChecksumMissing));
        assert_eq!(parse_release(&json("0.7.5", &zip("0.7.5"), Some("abc")), false), Err(ErrorCode::ChecksumMissing));
    }

    #[test]
    fn refuses_garbage() {
        assert_eq!(parse_release("not json", false), Err(ErrorCode::Network));
    }

    #[test]
    fn allows_a_local_http_mock_only_when_asked() {
        let local = "http://127.0.0.1:9/releases/download/v0.7.5/cap.zip";
        let body = json("0.7.5", local, Some(SHA));
        assert_eq!(parse_release(&body, false), Err(ErrorCode::Manifest));
        assert_eq!(parse_release(&body, true).unwrap().zip_url, local);
    }

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.7.10", "0.7.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(!is_newer("0.7.5", "0.7.5"));
        assert!(!is_newer("0.7.4", "0.7.5"));
        assert!(!is_newer("junk", "0.7.5"));
    }

    #[test]
    fn reads_the_apps_own_latest_version() {
        let body = r#"{"version":"0.8.2","pageUrl":"https://github.com/x","app":{"version":"1.0.1","pageUrl":"https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/app-v1.0.1","downloads":{}}}"#;
        assert_eq!(
            parse_app_latest(body),
            Some(("1.0.1".to_string(), "https://github.com/quyenlei/ConnecttechAutoPoster/releases/tag/app-v1.0.1".to_string()))
        );
        assert_eq!(parse_app_latest(r#"{"version":"0.8.2"}"#), None, "older update.json without app");
        assert_eq!(parse_app_latest(r#"{"app":{"version":"1.0"}}"#), None);
        assert_eq!(parse_app_latest(r#"{"app":{"version":"1.0.1","pageUrl":"https://evil.example/"}}"#), None, "github.com pages only");
    }

    #[test]
    fn error_codes_match_the_script_helper() {
        let codes: Vec<_> = [ErrorCode::Network, ErrorCode::Manifest, ErrorCode::ChecksumMissing, ErrorCode::Checksum, ErrorCode::Archive, ErrorCode::Folder]
            .iter()
            .map(|c| c.as_str())
            .collect();
        assert_eq!(codes, ["network", "manifest", "checksum-missing", "checksum", "archive", "folder"]);
    }
}
