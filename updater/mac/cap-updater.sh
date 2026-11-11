#!/bin/bash
# Connecttech Auto Poster updater helper for macOS (Chrome native messaging host "com.connecttech.cap_updater").
#
# Chrome starts it only for the CAP extension (allowed_origins in the host manifest written by install.command).
# It answers two messages:
#   {"type":"ping"}   -> {"ok":true,"helper":1,"version":"<installed version or null>","folder":"<extension folder>"}
#   {"type":"update"} -> reads update.json from the CAP repository, downloads the zip it names from the CAP
#                        releases on github.com, checks its SHA-256, and mirrors it into the extension folder:
#                        {"ok":true,"version":"x.y.z","changed":true|false} or {"ok":false,"code":"<reason>"}
# It never runs anything it downloads; Chrome loads the new files when the extension reloads itself.
# `cap-updater.sh --install` does the same update from a terminal (used by install.command).
#
# CAP_UPDATER_* / CAP_UPDATE_MANIFEST_URL / CAP_DOWNLOAD_PREFIX override paths and URLs for tests only.
set -u

ROOT="${CAP_UPDATER_HOME:-$HOME/Library/Application Support/ConnecttechAutoPoster}"
EXT="$ROOT/extension"
LOG="$ROOT/updater/updater.log"
MANIFEST_URL="${CAP_UPDATE_MANIFEST_URL:-https://raw.githubusercontent.com/quyenlei/ConnecttechAutoPoster/update/update.json}"
DOWNLOAD_PREFIX="${CAP_DOWNLOAD_PREFIX:-https://github.com/quyenlei/ConnecttechAutoPoster/releases/download/}"
PROTO="=https"
[ "${CAP_UPDATER_ALLOW_HTTP:-}" = "1" ] && PROTO="=http,https"

log() { mkdir -p "$(dirname "$LOG")" 2>/dev/null && printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"; }
json_string() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; printf '"%s"' "$s"; }
field() { plutil -extract "$1" raw -o - "$2" 2>/dev/null; }
installed_version() { [ -f "$EXT/manifest.json" ] && field version "$EXT/manifest.json"; }

# Native messaging frame: 4-byte little-endian length, then UTF-8 JSON.
read_message() {
  local len
  len=$(dd bs=1 count=4 2>/dev/null | od -An -tu4 | tr -d ' \n')
  [ -n "$len" ] || return 1
  dd bs=1 count="$len" 2>/dev/null
}
send_message() {
  local n
  n=$(printf '%s' "$1" | wc -c | tr -d ' ')
  printf "$(printf '\\%03o\\%03o\\%03o\\%03o' $((n & 255)) $(((n >> 8) & 255)) $(((n >> 16) & 255)) $(((n >> 24) & 255)))"
  printf '%s' "$1"
}

TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT

# Sets RESULT to the reply JSON. Returns 0 on success.
do_update() {
  TMP=$(mktemp -d) || { RESULT='{"ok":false,"code":"folder"}'; return 1; }
  if ! curl -fsSL --proto "$PROTO" --max-time 30 "$MANIFEST_URL" -o "$TMP/update.json"; then
    RESULT='{"ok":false,"code":"network"}'; return 1
  fi
  local version zip sha installed actual
  version=$(field version "$TMP/update.json")
  zip=$(field zipUrl "$TMP/update.json")
  sha=$(field sha256 "$TMP/update.json" | tr 'A-F' 'a-f')
  if ! [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ $zip != "$DOWNLOAD_PREFIX"* ]] || ! [[ $zip =~ ^[A-Za-z0-9._/:-]+$ ]]; then
    RESULT='{"ok":false,"code":"manifest"}'; return 1
  fi
  if ! [[ $sha =~ ^[0-9a-f]{64}$ ]]; then RESULT='{"ok":false,"code":"checksum-missing"}'; return 1; fi
  installed=$(installed_version)
  if [ "$installed" = "$version" ]; then
    RESULT="{\"ok\":true,\"version\":\"$version\",\"changed\":false}"; return 0
  fi
  if ! curl -fsSL --proto "$PROTO" --max-time 300 "$zip" -o "$TMP/cap.zip"; then
    RESULT='{"ok":false,"code":"network"}'; return 1
  fi
  actual=$(shasum -a 256 "$TMP/cap.zip" | cut -d' ' -f1)
  if [ "$actual" != "$sha" ]; then RESULT='{"ok":false,"code":"checksum"}'; return 1; fi
  mkdir -p "$TMP/x"
  if ! unzip -q "$TMP/cap.zip" -d "$TMP/x" || [ "$(field version "$TMP/x/manifest.json")" != "$version" ]; then
    RESULT='{"ok":false,"code":"archive"}'; return 1
  fi
  # Replace the whole folder: zips from wxt date every file 1980, so size/time based copying would skip changes.
  rm -rf "$EXT.new" "$EXT.old"
  if ! cp -R "$TMP/x" "$EXT.new"; then rm -rf "$EXT.new"; RESULT='{"ok":false,"code":"folder"}'; return 1; fi
  if [ -d "$EXT" ] && ! mv "$EXT" "$EXT.old"; then rm -rf "$EXT.new"; RESULT='{"ok":false,"code":"folder"}'; return 1; fi
  if ! mv "$EXT.new" "$EXT"; then
    [ -d "$EXT.old" ] && mv "$EXT.old" "$EXT"
    RESULT='{"ok":false,"code":"folder"}'; return 1
  fi
  rm -rf "$EXT.old"
  RESULT="{\"ok\":true,\"version\":\"$version\",\"changed\":true}"
  return 0
}

if [ "${1:-}" = "--install" ]; then
  do_update; status=$?
  log "install: $RESULT"
  printf '%s\n' "$RESULT"
  exit $status
fi

message=$(read_message) || exit 0
case "$message" in
  *'"type":"ping"'*)
    v=$(installed_version)
    reply="{\"ok\":true,\"helper\":1,\"version\":$([ -n "$v" ] && json_string "$v" || printf null),\"folder\":$(json_string "$EXT")}"
    ;;
  *'"type":"update"'*)
    do_update
    reply=$RESULT
    log "update: $reply"
    ;;
  *)
    reply='{"ok":false,"code":"unknown"}'
    ;;
esac
send_message "$reply"
