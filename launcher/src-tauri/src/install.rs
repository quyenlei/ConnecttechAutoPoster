//! Installs or updates CAP in a folder from a release named in `update.json`: download, SHA-256, unzip, check the
//! version, then replace the folder file by file (never by size/time: wxt zips date every file 1980), writing the
//! root `manifest.json` last so an interrupted copy still reports the old version and is retried.

use crate::release::{parse_release, ErrorCode, Release};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::io::AsyncWriteExt;

/// Version in `<dir>/manifest.json`, if there is one.
pub fn installed_version(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json.get("version")?.as_str().map(str::to_string)
}

/// True when `dir` holds CAP (its manifest names Connecttech Auto Poster). The app replaces every file in the CAP
/// folder, so it must never adopt any other folder.
pub fn is_cap_folder(dir: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(dir.join("manifest.json")) else { return false };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|m| m.get("name").and_then(|n| n.as_str()).map(|n| n == "Connecttech Auto Poster"))
        .unwrap_or(false)
}

/// GETs and validates `update.json`.
pub async fn fetch_release(client: &reqwest::Client, url: &str, allow_http: bool) -> Result<Release, ErrorCode> {
    parse_release(&fetch_text(client, url).await?, allow_http)
}

/// GETs a small text file (update.json) within 30 s.
pub async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, ErrorCode> {
    let response = client.get(url).timeout(Duration::from_secs(30)).send().await.map_err(|_| ErrorCode::Network)?;
    if !response.status().is_success() {
        return Err(ErrorCode::Network);
    }
    response.text().await.map_err(|_| ErrorCode::Network)
}

/// Brings `target` to `release`. Returns whether anything changed. `progress(done, total)` reports download bytes.
pub async fn install_release(
    client: &reqwest::Client,
    release: &Release,
    staging: &Path,
    target: &Path,
    progress: impl Fn(u64, Option<u64>),
) -> Result<bool, ErrorCode> {
    if installed_version(target).as_deref() == Some(release.version.as_str()) {
        return Ok(false);
    }
    let work = staging.join(format!("cap-{}-{}", release.version, std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|_| ErrorCode::Folder)?;
    let result = install_in(client, release, &work, target, &progress).await;
    let _ = std::fs::remove_dir_all(&work);
    result.map(|_| true)
}

async fn install_in(
    client: &reqwest::Client,
    release: &Release,
    work: &Path,
    target: &Path,
    progress: &impl Fn(u64, Option<u64>),
) -> Result<(), ErrorCode> {
    let zip_path = work.join("cap.zip");
    let actual = download(client, &release.zip_url, &zip_path, progress).await?;
    if actual != release.sha256 {
        return Err(ErrorCode::Checksum);
    }
    let unpacked = work.join("x");
    extract(&zip_path, &unpacked).map_err(|_| ErrorCode::Archive)?;
    if installed_version(&unpacked).as_deref() != Some(release.version.as_str()) {
        return Err(ErrorCode::Archive);
    }
    replace_folder(&unpacked, target).map_err(|_| ErrorCode::Folder)
}

/// Streams `url` to `to` and returns the file's SHA-256 (lowercase hex).
pub(crate) async fn download(
    client: &reqwest::Client,
    url: &str,
    to: &Path,
    progress: &impl Fn(u64, Option<u64>),
) -> Result<String, ErrorCode> {
    let response = client.get(url).timeout(Duration::from_secs(900)).send().await.map_err(|_| ErrorCode::Network)?;
    if !response.status().is_success() {
        return Err(ErrorCode::Network);
    }
    let total = response.content_length();
    let mut file = tokio::fs::File::create(to).await.map_err(|_| ErrorCode::Folder)?;
    let mut hasher = Sha256::new();
    let mut done = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| ErrorCode::Network)?;
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|_| ErrorCode::Folder)?;
        done += chunk.len() as u64;
        progress(done, total);
    }
    file.flush().await.map_err(|_| ErrorCode::Folder)?;
    Ok(hex::encode(hasher.finalize()))
}

/// Unzips `zip` into `to`, refusing entries that would land outside it.
pub(crate) fn extract(zip: &Path, to: &Path) -> std::io::Result<()> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(zip)?)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(name) = entry.enclosed_name() else {
            return Err(std::io::Error::other("unsafe path in archive"));
        };
        let out = to.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        #[cfg(unix)]
        if entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) {
            // Symlinks inside an app bundle (Chrome for Testing on macOS). Only plain relative targets.
            let mut target = String::new();
            std::io::Read::read_to_string(&mut entry, &mut target)?;
            let link = Path::new(&target);
            if link.is_absolute() || link.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
                return Err(std::io::Error::other("unsafe link in archive"));
            }
            std::os::unix::fs::symlink(link, &out)?;
            continue;
        }
        let mut file = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut file)?;
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            // Keep executables runnable (Chrome for Testing), and every file readable by the user.
            std::fs::set_permissions(&out, std::fs::Permissions::from_mode((mode & 0o777) | 0o600))?;
        }
    }
    Ok(())
}

/// Makes `to` an exact copy of `from`.
pub fn replace_folder(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    let wanted = files_in(from)?;
    let manifest = PathBuf::from("manifest.json");
    for rel in wanted.iter().filter(|r| **r != manifest) {
        copy_one(&from.join(rel), &to.join(rel))?;
    }
    for rel in files_in(to)? {
        if !wanted.contains(&rel) {
            make_writable(&to.join(&rel));
            std::fs::remove_file(to.join(&rel))?;
        }
    }
    remove_extra_dirs(from, to, to)?;
    if wanted.contains(&manifest) {
        copy_one(&from.join(&manifest), &to.join(&manifest))?;
    }
    Ok(())
}

/// Every file under `root`, relative to it.
fn files_in(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_path_buf());
            }
        }
    }
    Ok(out)
}

fn remove_extra_dirs(from: &Path, to: &Path, dir: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let rel = path.strip_prefix(to).map_err(std::io::Error::other)?;
        if from.join(rel).is_dir() {
            remove_extra_dirs(from, to, &path)?;
        } else {
            std::fs::remove_dir_all(&path)?;
        }
    }
    Ok(())
}

fn copy_one(source: &Path, target: &Path) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if target.exists() {
        make_writable(target);
    }
    // Write beside it, then rename over it: the old file stays whole until the new one is complete.
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".capnew");
    let tmp = PathBuf::from(tmp);
    if let Err(e) = std::fs::copy(source, &tmp).and_then(|_| std::fs::rename(&tmp, target)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

fn make_writable(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(false);
        let _ = std::fs::set_permissions(path, perms);
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// A tiny HTTP server for tests: serves fixed bodies by path, 404 otherwise.
    pub struct Mock {
        pub base: String,
        files: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    }

    impl Mock {
        pub fn start() -> Mock {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let files: Arc<Mutex<HashMap<String, Vec<u8>>>> = Arc::default();
            let served = files.clone();
            std::thread::spawn(move || {
                for stream in listener.incoming().flatten() {
                    let served = served.clone();
                    std::thread::spawn(move || {
                        let mut stream = stream;
                        let mut buf = [0u8; 4096];
                        let n = stream.read(&mut buf).unwrap_or(0);
                        let head = String::from_utf8_lossy(&buf[..n]);
                        let path = head.split_whitespace().nth(1).unwrap_or("/").to_string();
                        let body = served.lock().unwrap().get(&path).cloned();
                        let (status, body) = match body {
                            Some(b) => ("200 OK", b),
                            None => ("404 Not Found", Vec::new()),
                        };
                        let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                        let _ = stream.write_all(&body);
                    });
                }
            });
            Mock { base, files }
        }

        pub fn put(&self, path: &str, body: Vec<u8>) {
            self.files.lock().unwrap().insert(path.to_string(), body);
        }

        /// Publishes a CAP zip and returns its release.
        pub fn publish(&self, version: &str, extra: &str) -> Release {
            let data = cap_zip(version, extra);
            let path = format!("/releases/download/v{version}/cap.zip");
            let sha256 = hex::encode(Sha256::digest(&data));
            self.put(&path, data);
            Release { version: version.into(), zip_url: format!("{}{path}", self.base), sha256 }
        }
    }

    /// A zip like wxt's: every entry dated 1980, same-size manifests across versions.
    pub fn cap_zip(version: &str, extra: &str) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut out);
            let opts = zip::write::SimpleFileOptions::default();
            z.start_file("manifest.json", opts).unwrap();
            write!(z, r#"{{"manifest_version":3,"name":"Connecttech Auto Poster","version":"{version}"}}"#).unwrap();
            z.start_file(extra, opts).unwrap();
            z.write_all(b"console.log(1);").unwrap();
            z.start_file("assets/app.css", opts).unwrap();
            z.write_all(b"body{}").unwrap();
            z.finish().unwrap();
        }
        out.into_inner()
    }

    fn client() -> reqwest::Client {
        reqwest::Client::new()
    }

    #[tokio::test]
    async fn installs_then_mirrors_the_next_release() {
        let mock = Mock::start();
        let dir = tempfile::tempdir().unwrap();
        let (staging, target) = (dir.path().join("staging"), dir.path().join("extension"));

        let first = mock.publish("9.9.1", "old.js");
        assert_eq!(install_release(&client(), &first, &staging, &target, |_, _| {}).await, Ok(true));
        assert_eq!(installed_version(&target).as_deref(), Some("9.9.1"));
        assert!(target.join("old.js").exists() && target.join("assets/app.css").exists());

        let second = mock.publish("9.9.2", "new.js");
        assert_eq!(install_release(&client(), &second, &staging, &target, |_, _| {}).await, Ok(true));
        assert_eq!(installed_version(&target).as_deref(), Some("9.9.2"));
        assert!(target.join("new.js").exists());
        assert!(!target.join("old.js").exists(), "files of the old release are removed");
        assert_eq!(install_release(&client(), &second, &staging, &target, |_, _| {}).await, Ok(false));
        assert!(!staging.exists() || std::fs::read_dir(&staging).unwrap().next().is_none(), "staging is cleaned up");
    }

    #[tokio::test]
    async fn refuses_a_wrong_checksum_and_leaves_the_folder_alone() {
        let mock = Mock::start();
        let dir = tempfile::tempdir().unwrap();
        let (staging, target) = (dir.path().join("staging"), dir.path().join("extension"));
        install_release(&client(), &mock.publish("9.9.1", "old.js"), &staging, &target, |_, _| {}).await.unwrap();

        let mut bad = mock.publish("9.9.2", "new.js");
        bad.sha256 = "0".repeat(64);
        assert_eq!(install_release(&client(), &bad, &staging, &target, |_, _| {}).await, Err(ErrorCode::Checksum));
        assert_eq!(installed_version(&target).as_deref(), Some("9.9.1"));
        assert!(target.join("old.js").exists());
        assert!(!staging.exists() || std::fs::read_dir(&staging).unwrap().next().is_none(), "staging is cleaned up");
    }

    #[tokio::test]
    async fn refuses_a_zip_whose_manifest_is_another_version() {
        let mock = Mock::start();
        let dir = tempfile::tempdir().unwrap();
        let mut release = mock.publish("9.9.2", "new.js");
        release.version = "9.9.3".into();
        let result = install_release(&client(), &release, &dir.path().join("s"), &dir.path().join("e"), |_, _| {}).await;
        assert_eq!(result, Err(ErrorCode::Archive));
    }

    #[tokio::test]
    async fn refuses_a_zip_that_escapes_its_folder() {
        let mock = Mock::start();
        let dir = tempfile::tempdir().unwrap();
        let mut out = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut out);
            z.start_file("manifest.json", zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(br#"{"version":"9.9.2"}"#).unwrap();
            z.start_file("../evil.js", zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(b"x").unwrap();
            z.finish().unwrap();
        }
        let data = out.into_inner();
        mock.put("/releases/download/v9.9.2/cap.zip", data.clone());
        let release = Release {
            version: "9.9.2".into(),
            zip_url: format!("{}/releases/download/v9.9.2/cap.zip", mock.base),
            sha256: hex::encode(Sha256::digest(&data)),
        };
        let target = dir.path().join("e");
        let result = install_release(&client(), &release, &dir.path().join("s"), &target, |_, _| {}).await;
        assert_eq!(result, Err(ErrorCode::Archive));
        assert!(!dir.path().join("evil.js").exists());
    }

    #[tokio::test]
    async fn reports_a_missing_zip_as_network() {
        let mock = Mock::start();
        let dir = tempfile::tempdir().unwrap();
        let mut release = mock.publish("9.9.2", "new.js");
        release.zip_url = format!("{}/releases/download/v9.9.2/missing.zip", mock.base);
        let result = install_release(&client(), &release, &dir.path().join("s"), &dir.path().join("e"), |_, _| {}).await;
        assert_eq!(result, Err(ErrorCode::Network));
    }

    #[tokio::test]
    async fn fetches_and_validates_update_json() {
        let mock = Mock::start();
        let release = mock.publish("9.9.2", "new.js");
        let body = format!(r#"{{"version":"9.9.2","zipUrl":"{}","sha256":"{}"}}"#, release.zip_url, release.sha256);
        mock.put("/update.json", body.into_bytes());
        let url = format!("{}/update.json", mock.base);
        assert_eq!(fetch_release(&client(), &url, true).await, Ok(release));
        assert_eq!(fetch_release(&client(), &format!("{}/nothing.json", mock.base), true).await, Err(ErrorCode::Network));
    }

    #[test]
    fn replace_folder_overwrites_read_only_files_and_writes_the_manifest_last() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("from"), dir.path().join("to"));
        std::fs::create_dir_all(from.join("sub")).unwrap();
        std::fs::create_dir_all(to.join("gone")).unwrap();
        std::fs::write(from.join("manifest.json"), r#"{"version":"2.0.0"}"#).unwrap();
        std::fs::write(from.join("sub/a.js"), "new").unwrap();
        std::fs::write(to.join("manifest.json"), r#"{"version":"1.0.0"}"#).unwrap();
        std::fs::create_dir_all(to.join("sub")).unwrap();
        std::fs::write(to.join("sub/a.js"), "old").unwrap();
        std::fs::write(to.join("gone/b.js"), "old").unwrap();
        let mut perms = std::fs::metadata(to.join("sub/a.js")).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(to.join("sub/a.js"), perms).unwrap();

        replace_folder(&from, &to).unwrap();
        assert_eq!(std::fs::read_to_string(to.join("sub/a.js")).unwrap(), "new");
        assert_eq!(installed_version(&to).as_deref(), Some("2.0.0"));
        assert!(!to.join("gone").exists());
    }

    #[cfg(unix)]
    #[test]
    fn extract_keeps_relative_symlinks_and_refuses_escaping_ones() {
        let dir = tempfile::tempdir().unwrap();
        let make = |name: &str, link: &str| {
            let path = dir.path().join(name);
            let mut z = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
            let opts = zip::write::SimpleFileOptions::default();
            z.start_file("App.app/Versions/A/lib", opts).unwrap();
            z.write_all(b"lib").unwrap();
            z.add_symlink("App.app/Versions/Current", link, opts).unwrap();
            z.finish().unwrap();
            path
        };
        let good = make("good.zip", "A");
        extract(&good, &dir.path().join("good")).unwrap();
        let current = dir.path().join("good/App.app/Versions/Current");
        assert!(std::fs::symlink_metadata(&current).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read_to_string(current.join("lib")).unwrap(), "lib");

        let bad = make("bad.zip", "../../../../etc");
        assert!(extract(&bad, &dir.path().join("bad")).is_err());
    }

    /// A file is replaced by writing a temporary file and renaming it over the old one, never by rewriting the old
    /// file in place: a full disk or crash mid-copy then leaves the old, loadable file. A hard link shows the
    /// difference: an in-place write would change the linked file too.
    #[test]
    fn replace_folder_never_rewrites_a_file_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let (from, to) = (dir.path().join("from"), dir.path().join("to"));
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(from.join("background.js"), "new").unwrap();
        std::fs::write(dir.path().join("elsewhere.js"), "old").unwrap();
        std::fs::hard_link(dir.path().join("elsewhere.js"), to.join("background.js")).unwrap();

        replace_folder(&from, &to).unwrap();
        assert_eq!(std::fs::read_to_string(to.join("background.js")).unwrap(), "new");
        assert_eq!(std::fs::read_to_string(dir.path().join("elsewhere.js")).unwrap(), "old");
        assert!(files_in(&to).unwrap().iter().all(|p| !p.to_string_lossy().ends_with(".capnew")), "no temp files left");
    }

    #[test]
    fn adopts_only_a_cap_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!is_cap_folder(dir.path()), "empty folder");
        std::fs::write(dir.path().join("manifest.json"), r#"{"manifest_version":3,"name":"Other Extension","version":"1.0.0"}"#).unwrap();
        assert!(!is_cap_folder(dir.path()), "another extension");
        std::fs::write(dir.path().join("manifest.json"), r#"{"manifest_version":3,"name":"Connecttech Auto Poster","version":"0.8.0"}"#).unwrap();
        assert!(is_cap_folder(dir.path()));
        assert!(!is_cap_folder(&dir.path().join("missing")));
    }

    #[test]
    fn installed_version_is_none_without_a_manifest() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(installed_version(dir.path()), None);
    }
}
