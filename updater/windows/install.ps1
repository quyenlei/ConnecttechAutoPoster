# Installs the Connecttech Auto Poster updater on Windows (double-click install.bat).
# 1. Copies cap-updater.ps1 to %LOCALAPPDATA%\ConnecttechAutoPoster\updater\ and writes cap-updater.bat next to it.
# 2. Registers it with Google Chrome as native messaging host "com.connecttech.cap_updater" (current user only,
#    HKCU), allowed only for the CAP extension ID below.
# 3. Downloads the latest CAP release into %LOCALAPPDATA%\ConnecttechAutoPoster\extension\.
# Run it again any time to repair the installation. Nothing runs in the background. No administrator rights needed.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Id = 'ebembjpemaickbaogincmeajpgeabcbh'
$HostName = 'com.connecttech.cap_updater'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = if ($env:CAP_UPDATER_HOME) { $env:CAP_UPDATER_HOME } else { Join-Path $env:LOCALAPPDATA 'ConnecttechAutoPoster' }
$Updater = Join-Path $Root 'updater'
$Ext = Join-Path $Root 'extension'
$RegistryKey = if ($env:CAP_CHROME_REGISTRY_KEY) { $env:CAP_CHROME_REGISTRY_KEY } else { "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" }

function Fail([string]$Text) {
  Write-Host ''
  Write-Host ('LỖI: ' + $Text) -ForegroundColor Red
  exit 1
}

Write-Host 'Đang cài trình cập nhật Connecttech Auto Poster...'
try {
  New-Item -ItemType Directory -Force -Path $Updater, $Ext | Out-Null
  Copy-Item -Force -Path (Join-Path $Here 'cap-updater.ps1') -Destination (Join-Path $Updater 'cap-updater.ps1')
  try { Unblock-File -Path (Join-Path $Updater 'cap-updater.ps1') } catch { }
  $bat = "@echo off`r`npowershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"%~dp0cap-updater.ps1`" %*`r`n"
  [IO.File]::WriteAllText((Join-Path $Updater 'cap-updater.bat'), $bat, (New-Object Text.ASCIIEncoding))
} catch { Fail 'Không chép được chương trình cập nhật.' }

try {
  $manifestPath = Join-Path $Updater "$HostName.json"
  $manifest = [ordered]@{
    name = $HostName
    description = 'Connecttech Auto Poster updater'
    path = (Join-Path $Updater 'cap-updater.bat')
    type = 'stdio'
    allowed_origins = @("chrome-extension://$Id/")
  }
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  New-Item -Path $RegistryKey -Force | Out-Null
  Set-Item -Path $RegistryKey -Value $manifestPath
} catch { Fail 'Không đăng ký được với Chrome.' }

Write-Host 'Đang tải bản CAP mới nhất từ GitHub...'
$result = (& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $Updater 'cap-updater.ps1') install | Out-String).Trim()
if ($result -notmatch '"ok":\s*true') { Fail ("Không tải được CAP ($result). Kiểm tra mạng rồi chạy lại.") }

Write-Host ''
Write-Host 'Xong. CAP nằm trong thư mục:' -ForegroundColor Green
Write-Host ('  ' + $Ext)
Write-Host ''
Write-Host 'Nếu đây là lần đầu:'
Write-Host '  1. Ở bản CAP cũ: tab Sao lưu > Xuất bản sao lưu (dữ liệu không tự chuyển sang bản mới).'
Write-Host '  2. Mở chrome://extensions, bật Developer mode, gỡ bản CAP cũ.'
Write-Host '  3. Bấm Load unpacked và chọn thư mục trên (đường dẫn đã được chép, dán bằng Ctrl+V).'
Write-Host '  4. Ở bản mới: tab Sao lưu > Nhập dữ liệu.'
Write-Host 'Từ nay chỉ cần bấm "Cập nhật ngay" trong CAP.'
if (-not $env:CAP_UPDATER_TEST) {
  try { Set-Clipboard -Value $Ext } catch { }
  try { Start-Process explorer.exe $Ext } catch { }
}
