//! Real download of the published CAP release. Not run in CI; run by hand:
//! `cargo test --manifest-path launcher/src-tauri/Cargo.toml --test real_network -- --ignored --nocapture`

use launcher_lib::{install, release};

#[tokio::test]
#[ignore]
async fn installs_the_published_release() {
    let client = reqwest::Client::builder().https_only(true).build().unwrap();
    let data = tempfile::tempdir().unwrap();

    let latest = install::fetch_release(&client, release::UPDATE_JSON_URL, false).await.unwrap();
    let target = data.path().join("extension");
    assert!(install::install_release(&client, &latest, &data.path().join("staging"), &target, |_, _| {}).await.unwrap());
    assert_eq!(install::installed_version(&target), Some(latest.version.clone()));
    println!("CAP {} installed", latest.version);

}
