# Connecttech Auto Poster updater helper for Windows (Chrome native messaging host "com.connecttech.cap_updater").
# Chrome starts it through cap-updater.bat, only for the CAP extension (allowed_origins in the host manifest
# written by install.ps1). Same protocol as updater/mac/cap-updater.sh:
#   {"type":"ping"}   -> {"ok":true,"helper":1,"version":"<installed version or null>","folder":"<extension folder>"}
#   {"type":"update"} -> reads update.json from the CAP repository, downloads the zip it names from the CAP
#                        releases on github.com, checks its SHA-256, and mirrors it into the extension folder:
#                        {"ok":true,"version":"x.y.z","changed":true|false} or {"ok":false,"code":"<reason>"}
# It never runs anything it downloads; Chrome loads the new files when the extension reloads itself.
# `cap-updater.ps1 install` does the same update from a console (used by install.ps1). A plain word, not
# `--install`: Windows PowerShell's -File parsing does not pass double-dash arguments through reliably.
# Windows PowerShell 5.1 compatible. ASCII only. CAP_* environment variables override paths and URLs for tests only.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Root = if ($env:CAP_UPDATER_HOME) { $env:CAP_UPDATER_HOME } else { Join-Path $env:LOCALAPPDATA 'ConnecttechAutoPoster' }
$Ext = Join-Path $Root 'extension'
$LogFile = Join-Path $Root 'updater\updater.log'
$ManifestUrl = if ($env:CAP_UPDATE_MANIFEST_URL) { $env:CAP_UPDATE_MANIFEST_URL } else { 'https://raw.githubusercontent.com/quyenlei/ConnecttechAutoPoster/update/update.json' }
$DownloadPrefix = if ($env:CAP_DOWNLOAD_PREFIX) { $env:CAP_DOWNLOAD_PREFIX } else { 'https://github.com/quyenlei/ConnecttechAutoPoster/releases/download/' }
$AllowHttp = $env:CAP_UPDATER_ALLOW_HTTP -eq '1'

function Write-Log([string]$Text) {
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null
    Add-Content -Path $LogFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Text)
  } catch { }
}

function Get-InstalledVersion {
  $file = Join-Path $Ext 'manifest.json'
  if (-not (Test-Path $file)) { return $null }
  try { return [string]((Get-Content -Raw -Encoding UTF8 $file | ConvertFrom-Json).version) } catch { return $null }
}

function Test-AllowedUrl([string]$Url) {
  if ($AllowHttp) { return $Url -match '^https?://' }
  return $Url -match '^https://'
}

function Invoke-Update {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cap-update-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    if (-not (Test-AllowedUrl $ManifestUrl)) { return @{ ok = $false; code = 'manifest' } }
    try {
      $raw = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $ManifestUrl).Content
      if ($raw -is [byte[]]) { $raw = [Text.Encoding]::UTF8.GetString($raw) }
      $info = $raw | ConvertFrom-Json
    } catch { return @{ ok = $false; code = 'network' } }

    $version = [string]$info.version
    $zip = [string]$info.zipUrl
    $sha = ([string]$info.sha256).ToLowerInvariant()
    if ($version -notmatch '^\d+\.\d+\.\d+$' -or -not $zip.StartsWith($DownloadPrefix, [StringComparison]::Ordinal) -or
        $zip -notmatch '^[A-Za-z0-9._/:-]+$' -or -not (Test-AllowedUrl $zip)) {
      return @{ ok = $false; code = 'manifest' }
    }
    if ($sha -notmatch '^[0-9a-f]{64}$') { return @{ ok = $false; code = 'checksum-missing' } }
    if ((Get-InstalledVersion) -eq $version) { return @{ ok = $true; version = $version; changed = $false } }

    $zipFile = Join-Path $tmp 'cap.zip'
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 -Uri $zip -OutFile $zipFile } catch { return @{ ok = $false; code = 'network' } }
    if ((Get-FileHash -Algorithm SHA256 -Path $zipFile).Hash.ToLowerInvariant() -ne $sha) { return @{ ok = $false; code = 'checksum' } }

    $unpacked = Join-Path $tmp 'x'
    try {
      Expand-Archive -Path $zipFile -DestinationPath $unpacked -Force
      $newVersion = [string]((Get-Content -Raw -Encoding UTF8 (Join-Path $unpacked 'manifest.json') | ConvertFrom-Json).version)
    } catch { return @{ ok = $false; code = 'archive' } }
    if ($newVersion -ne $version) { return @{ ok = $false; code = 'archive' } }

    New-Item -ItemType Directory -Force -Path $Ext | Out-Null
    # /IS /IT: copy every file. Zips from wxt date every file 1980, so size/time comparison would skip changes.
    & robocopy.exe $unpacked $Ext /MIR /IS /IT /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
    if ($LASTEXITCODE -ge 8) { return @{ ok = $false; code = 'folder' } }
    return @{ ok = $true; version = $version; changed = $true }
  } catch {
    # Unexpected failure: keep the reason for the log; CAP shows its own message for the code.
    return @{ ok = $false; code = 'folder'; detail = [string]$_.Exception.Message }
  } finally {
    Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
  }
}

function ConvertTo-Reply($Table) { return (New-Object PSObject -Property $Table) | ConvertTo-Json -Compress }

if ($args.Count -gt 0 -and $args[0] -eq 'install') {
  $result = ConvertTo-Reply (Invoke-Update)
  Write-Log ('install: ' + $result)
  Write-Output $result
  if ($result -match '"ok":true') { exit 0 } else { exit 1 }
}

# Native messaging frame: 4-byte little-endian length, then UTF-8 JSON.
$stdin = [Console]::OpenStandardInput()
function Read-Exact([int]$Count) {
  $buffer = New-Object byte[] $Count
  $offset = 0
  while ($offset -lt $Count) {
    $read = $stdin.Read($buffer, $offset, $Count - $offset)
    if ($read -le 0) { return $null }
    $offset += $read
  }
  return ,$buffer
}

$header = Read-Exact 4
if ($null -eq $header) { exit 0 }
$length = [BitConverter]::ToInt32($header, 0)
if ($length -le 0 -or $length -gt 65536) { exit 0 }
$body = Read-Exact $length
if ($null -eq $body) { exit 0 }

try { $request = [Text.Encoding]::UTF8.GetString($body) | ConvertFrom-Json } catch { $request = $null }
$type = if ($request) { [string]$request.type } else { '' }
if ($type -eq 'ping') {
  $reply = ConvertTo-Reply @{ ok = $true; helper = 1; version = (Get-InstalledVersion); folder = $Ext }
} elseif ($type -eq 'update') {
  $reply = ConvertTo-Reply (Invoke-Update)
  Write-Log ('update: ' + $reply)
} else {
  $reply = ConvertTo-Reply @{ ok = $false; code = 'unknown' }
}

$bytes = [Text.Encoding]::UTF8.GetBytes($reply)
$stdout = [Console]::OpenStandardOutput()
$stdout.Write([BitConverter]::GetBytes([int32]$bytes.Length), 0, 4)
$stdout.Write($bytes, 0, $bytes.Length)
$stdout.Flush()
