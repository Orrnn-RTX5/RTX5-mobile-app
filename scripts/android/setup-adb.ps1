$ErrorActionPreference = 'Stop'

$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$platformToolsDest = Join-Path $sdkRoot 'platform-tools'
$tempZip = Join-Path $env:TEMP 'platform-tools.zip'
$extractDir = Join-Path $env:TEMP 'platform-tools-extract'

Write-Host "Setting up Android SDK Platform-Tools (ADB)..."
if (-not (Test-Path -LiteralPath $sdkRoot)) {
    New-Item -ItemType Directory -Path $sdkRoot -Force | Out-Null
}

$url = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'
Write-Host "Downloading Platform-Tools from Google ($url)..."
Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing

Write-Host "Extracting files..."
if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
}
Expand-Archive -Path $tempZip -DestinationPath $extractDir -Force

if (Test-Path -LiteralPath $platformToolsDest) {
    Remove-Item -LiteralPath $platformToolsDest -Recurse -Force
}
Copy-Item -Path (Join-Path $extractDir 'platform-tools') -Destination $sdkRoot -Recurse -Force

# Clean up temporary archive and extract folder
Remove-Item -LiteralPath $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Configuring environment variables..."
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkRoot, 'User')

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = if ($userPath) { $userPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) } else { @() }
if ($parts -notcontains $platformToolsDest) {
    $newUserPath = ($parts + $platformToolsDest) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
}

# Update in current session
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$platformToolsDest;$env:Path"

$adbExe = Join-Path $platformToolsDest 'adb.exe'
if (Test-Path -LiteralPath $adbExe) {
    Write-Host "`nADB successfully installed!" -ForegroundColor Green
    & $adbExe version
    Write-Host "`nLocation: $platformToolsDest"
} else {
    Write-Error "Failed to locate adb.exe after installation."
}
