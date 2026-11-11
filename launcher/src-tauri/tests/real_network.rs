//! Real downloads (GitHub release + Chrome for Testing, ~200 MB). Not run in CI; run by hand:
//! `cargo test --manifest-path launcher/src-tauri/Cargo.toml --test real_network -- --ignored --nocapture`

use launcher_lib::{browser, install, release};

#[tokio::test]
#[ignore]
async fn installs_the_published_release_and_a_runnable_browser() {
    let client = reqwest::Client::builder().https_only(true).build().unwrap();
    let data = tempfile::tempdir().unwrap();

    let latest = install::fetch_release(&client, release::UPDATE_JSON_URL, false).await.unwrap();
    let target = data.path().join("extension");
    assert!(install::install_release(&client, &latest, &data.path().join("staging"), &target, |_, _| {}).await.unwrap());
    assert_eq!(install::installed_version(&target), Some(latest.version.clone()));
    println!("CAP {} installed", latest.version);

    let platform = browser::platform_key(std::env::consts::OS, std::env::consts::ARCH).expect("supported platform");
    let index = client.get(browser::INDEX_URL).send().await.unwrap().text().await.unwrap();
    let build = browser::parse_index(&index, platform, false).unwrap();
    let exe = browser::install_browser(&client, &build, platform, data.path(), false, |_, _| {}).await.unwrap();
    let out = std::process::Command::new(&exe).arg("--version").output().unwrap();
    let version = String::from_utf8_lossy(&out.stdout);
    println!("browser: {}", version.trim());
    assert!(version.contains(&build.version), "{version}");
}
