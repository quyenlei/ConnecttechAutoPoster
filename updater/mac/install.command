#!/bin/bash
# Installs the Connecttech Auto Poster updater on macOS (double-click in Finder, or run `bash install.command`).
# 1. Copies cap-updater.sh to ~/Library/Application Support/ConnecttechAutoPoster/updater/.
# 2. Registers it with Google Chrome as native messaging host "com.connecttech.cap_updater", allowed only for the
#    CAP extension ID below.
# 3. Downloads the latest CAP release into ~/Library/Application Support/ConnecttechAutoPoster/extension/.
# Run it again any time to repair the installation. Nothing runs in the background.
set -u

ID="ebembjpemaickbaogincmeajpgeabcbh"
HOST="com.connecttech.cap_updater"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${CAP_UPDATER_HOME:-$HOME/Library/Application Support/ConnecttechAutoPoster}"
HOSTS="${CAP_CHROME_HOSTS_DIR:-$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts}"
HELPER="$ROOT/updater/cap-updater.sh"

fail() { printf '\nLỖI: %s\n' "$1"; [ -z "${CAP_UPDATER_TEST:-}" ] && read -r -p "Nhấn Enter để đóng..." _; exit 1; }

echo "Đang cài trình cập nhật Connecttech Auto Poster..."
mkdir -p "$ROOT/updater" "$ROOT/extension" "$HOSTS" || fail "Không tạo được thư mục cài đặt."
cp "$HERE/cap-updater.sh" "$HELPER" || fail "Không chép được cap-updater.sh."
chmod 755 "$HELPER"
xattr -d com.apple.quarantine "$HELPER" 2>/dev/null || true

escaped=${HELPER//\\/\\\\}; escaped=${escaped//\"/\\\"}
cat > "$HOSTS/$HOST.json" <<EOF || fail "Không đăng ký được với Chrome."
{
  "name": "$HOST",
  "description": "Connecttech Auto Poster updater",
  "path": "$escaped",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
EOF

echo "Đang tải bản CAP mới nhất từ GitHub..."
result=$("$HELPER" --install) || fail "Không tải được CAP ($result). Kiểm tra mạng rồi chạy lại."

echo
echo "Xong. CAP nằm trong thư mục:"
echo "  $ROOT/extension"
echo
echo "Nếu đây là lần đầu:"
echo "  1. Ở bản CAP cũ: tab Sao lưu > Xuất bản sao lưu (dữ liệu không tự chuyển sang bản mới)."
echo "  2. Mở chrome://extensions, bật Developer mode, gỡ bản CAP cũ."
echo "  3. Bấm Load unpacked và chọn thư mục trên (đường dẫn đã được chép, nhấn Cmd+Shift+G rồi Cmd+V)."
echo "  4. Ở bản mới: tab Sao lưu > Nhập dữ liệu."
echo "Từ nay chỉ cần bấm \"Cập nhật ngay\" trong CAP."
if [ -z "${CAP_UPDATER_TEST:-}" ]; then
  printf '%s' "$ROOT/extension" | pbcopy
  open "$ROOT/extension"
  read -r -p "Nhấn Enter để đóng..." _
fi
