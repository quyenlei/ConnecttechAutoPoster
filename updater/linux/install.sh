#!/bin/bash
# Installs the Connecttech Auto Poster updater on Linux (in a terminal: `bash install.sh`).
# 1. Copies cap-updater.sh to ~/.local/share/ConnecttechAutoPoster/updater/.
# 2. Registers it as native messaging host "com.connecttech.cap_updater", allowed only for the CAP extension ID
#    below, with Google Chrome and, when it is set up, Chromium (both in ~/.config).
# 3. Downloads the latest CAP release into ~/.local/share/ConnecttechAutoPoster/extension/.
# Run it again any time to repair the installation. Nothing runs in the background. No sudo needed.
# Chromium from Snap or Flatpak cannot start native messaging hosts; use Chrome or a .deb/.rpm Chromium.
set -u

ID="ebembjpemaickbaogincmeajpgeabcbh"
HOST="com.connecttech.cap_updater"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${CAP_UPDATER_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/ConnecttechAutoPoster}"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
HELPER="$ROOT/updater/cap-updater.sh"

fail() { printf '\nLỖI: %s\n' "$1"; [ -z "${CAP_UPDATER_TEST:-}" ] && read -r -p "Nhấn Enter để đóng..." _; exit 1; }

missing=""
for tool in curl unzip sha256sum; do command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"; done
[ -z "$missing" ] || fail "Máy thiếu:$missing. Cài rồi chạy lại, ví dụ: sudo apt install$missing"

# Where to register: Chrome always, Chromium only when it has a profile folder. Tests pass one folder instead.
if [ -n "${CAP_CHROME_HOSTS_DIR:-}" ]; then
  HOSTS_DIRS=("$CAP_CHROME_HOSTS_DIR")
else
  HOSTS_DIRS=("$CONFIG/google-chrome/NativeMessagingHosts")
  [ -d "$CONFIG/chromium" ] && HOSTS_DIRS+=("$CONFIG/chromium/NativeMessagingHosts")
fi

echo "Đang cài trình cập nhật Connecttech Auto Poster..."
mkdir -p "$ROOT/updater" "$ROOT/extension" || fail "Không tạo được thư mục cài đặt."
cp "$HERE/cap-updater.sh" "$HELPER" || fail "Không chép được cap-updater.sh."
chmod 755 "$HELPER"

escaped=${HELPER//\\/\\\\}; escaped=${escaped//\"/\\\"}
for dir in "${HOSTS_DIRS[@]}"; do
  mkdir -p "$dir" || fail "Không tạo được thư mục $dir."
  cat > "$dir/$HOST.json" <<EOF || fail "Không đăng ký được với trình duyệt."
{
  "name": "$HOST",
  "description": "Connecttech Auto Poster updater",
  "path": "$escaped",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
EOF
done

echo "Đang tải bản CAP mới nhất từ GitHub..."
result=$("$HELPER" --install) || fail "Không tải được CAP ($result). Kiểm tra mạng rồi chạy lại."

echo
echo "Xong. CAP nằm trong thư mục:"
echo "  $ROOT/extension"
echo
echo "Nếu đây là lần đầu:"
echo "  1. Ở bản CAP cũ: tab Sao lưu > Xuất bản sao lưu (dữ liệu không tự chuyển sang bản mới)."
echo "  2. Mở chrome://extensions, bật Developer mode, gỡ bản CAP cũ."
echo "  3. Bấm Load unpacked và chọn thư mục trên (nhấn Ctrl+L rồi dán đường dẫn)."
echo "  4. Ở bản mới: tab Sao lưu > Nhập dữ liệu."
echo "Từ nay chỉ cần bấm \"Cập nhật ngay\" trong CAP."
if [ -z "${CAP_UPDATER_TEST:-}" ]; then
  if command -v wl-copy >/dev/null 2>&1; then printf '%s' "$ROOT/extension" | wl-copy 2>/dev/null
  elif command -v xclip >/dev/null 2>&1; then printf '%s' "$ROOT/extension" | xclip -selection clipboard 2>/dev/null
  fi
  read -r -p "Nhấn Enter để đóng..." _
fi
