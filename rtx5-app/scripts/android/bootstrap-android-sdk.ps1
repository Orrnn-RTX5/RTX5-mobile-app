[CmdletBinding()]
param(
  [switch]$WithEmulator
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$repositoryRoot = Split-Path -Parent $projectRoot
$toolchainPath = Join-Path $repositoryRoot 'WORKSPACE_TOOLCHAIN.json'
if (-not (Test-Path -LiteralPath $toolchainPath)) {
  throw "Missing toolchain manifest: $toolchainPath"
}
$toolchain = Get-Content -Raw -LiteralPath $toolchainPath | ConvertFrom-Json
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$tempRoot = Join-Path $env:TEMP 'rtx5-android-bootstrap'
$cmdlineToolsArchive = "commandlinetools-win-$($toolchain.androidCommandLineToolsVersion)_latest.zip"
$platformToolsArchive = "platform-tools_r$($toolchain.androidPlatformToolsVersion)-win.zip"
$androidPlatformArchive = [string]$toolchain.androidPlatformArchive
$androidBuildToolsArchive = [string]$toolchain.androidBuildToolsArchive
$cmdlineToolsUrl = "https://dl.google.com/android/repository/$cmdlineToolsArchive"
$platformToolsUrl = "https://dl.google.com/android/repository/$platformToolsArchive"
$androidPlatformUrl = "https://dl.google.com/android/repository/$androidPlatformArchive"
$androidBuildToolsUrl = "https://dl.google.com/android/repository/$androidBuildToolsArchive"
$cmdlineToolsZip = Join-Path $tempRoot $cmdlineToolsArchive
$platformToolsZip = Join-Path $tempRoot $platformToolsArchive
$androidPlatformZip = Join-Path $tempRoot $androidPlatformArchive
$androidBuildToolsZip = Join-Path $tempRoot $androidBuildToolsArchive
$cmdlineToolsExtractRoot = Join-Path $tempRoot 'cmdline-tools-extract'
$platformToolsExtractRoot = Join-Path $tempRoot 'platform-tools-extract'
$androidPlatformExtractRoot = Join-Path $tempRoot 'android-platform-extract'
$androidBuildToolsExtractRoot = Join-Path $tempRoot 'android-build-tools-extract'
$platformToolsDestination = Join-Path $sdkRoot 'platform-tools'
$androidPlatformDestination = Join-Path $sdkRoot "platforms\$($toolchain.androidPlatform)"
$androidBuildToolsDestination = Join-Path $sdkRoot "build-tools\$($toolchain.androidBuildTools)"
$cmdlineToolsDestination = Join-Path $sdkRoot 'cmdline-tools'
$cmdlineToolsLatestDestination = Join-Path $cmdlineToolsDestination 'latest'
$sdkManager = Join-Path $cmdlineToolsLatestDestination 'bin\sdkmanager.bat'
$avdManager = Join-Path $cmdlineToolsLatestDestination 'bin\avdmanager.bat'
$defaultAvdName = [string]$toolchain.androidDefaultAvdName
$defaultSystemImagePackage = 'system-images;android-37.0;google_apis_playstore_ps16k;x86_64'
$requiredPackages = @()
if ($WithEmulator) {
  $requiredPackages += @(
    'emulator',
    $defaultSystemImagePackage
  )
}

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Add-PathEntry {
  param(
    [string]$ExistingPath,
    [string]$Entry
  )

  if ([string]::IsNullOrWhiteSpace($Entry)) {
    return $ExistingPath
  }

  $parts = @()
  if (-not [string]::IsNullOrWhiteSpace($ExistingPath)) {
    $parts = $ExistingPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries)
  }

  if ($parts -notcontains $Entry) {
    $parts = @($Entry) + $parts
  }

  return ($parts -join ';')
}

function Set-UserEnvironmentVariable {
  param(
    [string]$Name,
    [string]$Value
  )

  [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
  Set-Item -Path "Env:$Name" -Value $Value
}

function Assert-Sha256 {
  param(
    [string]$Path,
    [string]$Expected
  )

  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -ne $Expected.ToLowerInvariant()) {
    throw "SHA-256 verification failed for $(Split-Path -Leaf $Path)."
  }
}

function Assert-SafeChildPath {
  param(
    [string]$Path,
    [string]$Parent
  )

  $fullParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($fullParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside $Parent."
  }
}

function Reset-Directory {
  param(
    [string]$Path,
    [string]$AllowedParent
  )

  Assert-SafeChildPath -Path $Path -Parent $AllowedParent
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  Ensure-Directory -Path $Path
}

Ensure-Directory -Path $tempRoot
Ensure-Directory -Path $sdkRoot
Ensure-Directory -Path $cmdlineToolsDestination

Write-Host "Downloading Android command-line tools..."
Invoke-WebRequest -UseBasicParsing -Uri $cmdlineToolsUrl -OutFile $cmdlineToolsZip
Assert-Sha256 -Path $cmdlineToolsZip -Expected ([string]$toolchain.androidCommandLineToolsSha256)

Reset-Directory -Path $cmdlineToolsExtractRoot -AllowedParent $tempRoot

Expand-Archive -Path $cmdlineToolsZip -DestinationPath $cmdlineToolsExtractRoot -Force

Reset-Directory -Path $cmdlineToolsLatestDestination -AllowedParent $cmdlineToolsDestination
Copy-Item -Path (Join-Path $cmdlineToolsExtractRoot 'cmdline-tools\*') -Destination $cmdlineToolsLatestDestination -Recurse -Force

Write-Host "Downloading Android platform-tools..."
Invoke-WebRequest -UseBasicParsing -Uri $platformToolsUrl -OutFile $platformToolsZip
Assert-Sha256 -Path $platformToolsZip -Expected ([string]$toolchain.androidPlatformToolsSha256)

Reset-Directory -Path $platformToolsExtractRoot -AllowedParent $tempRoot

Expand-Archive -Path $platformToolsZip -DestinationPath $platformToolsExtractRoot -Force
Assert-SafeChildPath -Path $platformToolsDestination -Parent $sdkRoot
if (Test-Path -LiteralPath $platformToolsDestination) {
  Remove-Item -LiteralPath $platformToolsDestination -Recurse -Force
}
Copy-Item -Path (Join-Path $platformToolsExtractRoot 'platform-tools') -Destination $sdkRoot -Recurse -Force

Write-Host "Downloading Android platform $($toolchain.androidPlatform), revision $($toolchain.androidPlatformRevision)..."
Invoke-WebRequest -UseBasicParsing -Uri $androidPlatformUrl -OutFile $androidPlatformZip
Assert-Sha256 -Path $androidPlatformZip -Expected ([string]$toolchain.androidPlatformSha256)
Reset-Directory -Path $androidPlatformExtractRoot -AllowedParent $tempRoot
Expand-Archive -Path $androidPlatformZip -DestinationPath $androidPlatformExtractRoot -Force
Ensure-Directory -Path (Split-Path -Parent $androidPlatformDestination)
Assert-SafeChildPath -Path $androidPlatformDestination -Parent $sdkRoot
if (Test-Path -LiteralPath $androidPlatformDestination) {
  Remove-Item -LiteralPath $androidPlatformDestination -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $androidPlatformExtractRoot $toolchain.androidPlatform) -Destination $androidPlatformDestination -Recurse -Force

Write-Host "Downloading Android Build-Tools $($toolchain.androidBuildTools)..."
Invoke-WebRequest -UseBasicParsing -Uri $androidBuildToolsUrl -OutFile $androidBuildToolsZip
Assert-Sha256 -Path $androidBuildToolsZip -Expected ([string]$toolchain.androidBuildToolsSha256)
Reset-Directory -Path $androidBuildToolsExtractRoot -AllowedParent $tempRoot
Expand-Archive -Path $androidBuildToolsZip -DestinationPath $androidBuildToolsExtractRoot -Force
Ensure-Directory -Path (Split-Path -Parent $androidBuildToolsDestination)
Assert-SafeChildPath -Path $androidBuildToolsDestination -Parent $sdkRoot
if (Test-Path -LiteralPath $androidBuildToolsDestination) {
  Remove-Item -LiteralPath $androidBuildToolsDestination -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $androidBuildToolsExtractRoot 'android-16') -Destination $androidBuildToolsDestination -Recurse -Force

$platformProperties = Get-Content -LiteralPath (Join-Path $androidPlatformDestination 'source.properties')
$buildToolsProperties = Get-Content -LiteralPath (Join-Path $androidBuildToolsDestination 'source.properties')
if ($platformProperties -notcontains "Pkg.Revision=$($toolchain.androidPlatformRevision)") {
  throw 'The installed Android platform revision does not match WORKSPACE_TOOLCHAIN.json.'
}
if ($buildToolsProperties -notcontains "Pkg.Revision=$($toolchain.androidBuildTools)") {
  throw 'The installed Android Build-Tools revision does not match WORKSPACE_TOOLCHAIN.json.'
}
$adbVersionText = (& (Join-Path $platformToolsDestination 'adb.exe') version 2>$null | Out-String)
if (
  $LASTEXITCODE -ne 0 -or
  $adbVersionText -notmatch "Version\s+$([regex]::Escape([string]$toolchain.androidPlatformToolsVersion))(?:-|\s|$)"
) {
  throw 'The installed Android Platform-Tools revision does not match WORKSPACE_TOOLCHAIN.json.'
}

if (-not (Test-Path -LiteralPath $javaHome)) {
  throw "Android Studio JBR was not found at $javaHome"
}

Set-UserEnvironmentVariable -Name 'ANDROID_HOME' -Value $sdkRoot
Set-UserEnvironmentVariable -Name 'ANDROID_SDK_ROOT' -Value $sdkRoot
Set-UserEnvironmentVariable -Name 'JAVA_HOME' -Value $javaHome

$updatedUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $sdkRoot 'platform-tools')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $sdkRoot 'emulator')
$updatedUserPath = Add-PathEntry -ExistingPath $updatedUserPath -Entry (Join-Path $javaHome 'bin')
[Environment]::SetEnvironmentVariable('Path', $updatedUserPath, 'User')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $sdkRoot 'platform-tools')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $sdkRoot 'emulator')
$env:Path = Add-PathEntry -ExistingPath $env:Path -Entry (Join-Path $javaHome 'bin')

if (-not (Test-Path -LiteralPath $sdkManager)) {
  throw "sdkmanager was not installed at $sdkManager"
}

$licenseInput = 1..20 | ForEach-Object { 'y' }
$licenseInput | & $sdkManager --sdk_root=$sdkRoot --licenses
if ($LASTEXITCODE -ne 0) {
  throw "Android SDK license acceptance failed with exit code $LASTEXITCODE."
}

if ($requiredPackages.Count -gt 0) {
  Write-Host "Installing optional Android emulator packages..."
  $licenseInput | & $sdkManager --sdk_root=$sdkRoot @requiredPackages
  if ($LASTEXITCODE -ne 0) {
    throw "sdkmanager failed with exit code $LASTEXITCODE."
  }
}

if ($WithEmulator) {
  $avdPath = Join-Path $env:USERPROFILE ".android\avd\$defaultAvdName.avd"
  if (-not (Test-Path -LiteralPath $avdPath) -and (Test-Path -LiteralPath $avdManager)) {
    Write-Host "Creating default Android Virtual Device $defaultAvdName..."
    'no' | & $avdManager create avd -n $defaultAvdName -k $defaultSystemImagePackage --force
    if ($LASTEXITCODE -ne 0) {
      throw "avdmanager failed with exit code $LASTEXITCODE."
    }
  }
  if (-not (Test-Path -LiteralPath $avdPath)) {
    throw "The requested Android Virtual Device was not created at $avdPath."
  }
}

$androidRoot = Join-Path $projectRoot 'android'
if (Test-Path -LiteralPath $androidRoot) {
  $androidLocalProperties = Join-Path $androidRoot 'local.properties'
  "sdk.dir=$($sdkRoot.Replace('\', '\\'))" | Set-Content -Path $androidLocalProperties -Encoding ASCII
} else {
  Write-Host 'Skipped android/local.properties because the generated native directory is not present.'
}

Write-Host ''
Write-Host 'Android SDK bootstrap completed.'
Write-Host "SDK Root: $sdkRoot"
Write-Host "JAVA_HOME: $javaHome"
Write-Host "Platform-Tools: $($toolchain.androidPlatformToolsVersion)"
Write-Host "Emulator installed: $([bool]$WithEmulator)"
Write-Host 'Open a new terminal before running npm run android if you want the persisted PATH changes to apply globally.'
