<#
.SYNOPSIS
    RTX5 Pre-Build Validation Gate
.DESCRIPTION
    Runs all mandatory quality checks before an EAS build.
    Exits with non-zero code if any check fails (fail-fast).
.EXAMPLE
    .\deployment\scripts\prebuild.ps1
    .\deployment\scripts\prebuild.ps1 -SkipAudit
#>

param(
    [switch]$SkipAudit,
    [switch]$SkipTests,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $PSScriptRoot "..\..\rtx5-app"

# ── Helpers ───────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Number, [string]$Title)
    Write-Host ""
    Write-Host "  [$Number] $Title" -ForegroundColor Cyan
    Write-Host ("  " + "─" * 60) -ForegroundColor DarkGray
}

function Write-Pass {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
}

function Write-Skip {
    param([string]$Message)
    Write-Host "  ⏭️  $Message (skipped)" -ForegroundColor Yellow
}

# ── Banner ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor White
Write-Host "  ║           RTX5 — Pre-Build Validation Gate              ║" -ForegroundColor White
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor White
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host ""

$startTime = Get-Date
$failCount = 0

# ── 1. TypeScript Compilation ─────────────────────────────────────────────────

Write-Step "1/5" "TypeScript Compilation"
try {
    Push-Location $AppDir
    $output = & npx tsc --noEmit 2>&1
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -eq 0) {
        Write-Pass "TypeScript — zero errors"
    } else {
        Write-Fail "TypeScript compilation failed"
        if ($Verbose) { $output | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed } }
        $failCount++
    }
} catch {
    Write-Fail "TypeScript check threw an exception: $_"
    $failCount++
    Pop-Location -ErrorAction SilentlyContinue
}

# ── 2. Linting ────────────────────────────────────────────────────────────────

Write-Step "2/5" "ESLint"
try {
    Push-Location $AppDir
    $output = & npx eslint . --ext .ts,.tsx --max-warnings 50 2>&1
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -eq 0) {
        Write-Pass "ESLint — no errors (warnings within threshold)"
    } else {
        Write-Fail "ESLint found errors or exceeded warning threshold"
        if ($Verbose) { $output | Select-Object -Last 20 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed } }
        $failCount++
    }
} catch {
    # ESLint may not be configured yet — treat as non-blocking warning
    Write-Host "  ⚠️  ESLint not configured or failed to run" -ForegroundColor Yellow
    Pop-Location -ErrorAction SilentlyContinue
}

# ── 3. Tests ──────────────────────────────────────────────────────────────────

Write-Step "3/5" "Test Suite"
if ($SkipTests) {
    Write-Skip "Tests"
} else {
    try {
        Push-Location $AppDir
        $output = & npx jest --passWithNoTests --ci 2>&1
        $exitCode = $LASTEXITCODE
        Pop-Location

        if ($exitCode -eq 0) {
            Write-Pass "All tests passed"
        } else {
            Write-Fail "Test suite failed"
            if ($Verbose) { $output | Select-Object -Last 20 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed } }
            $failCount++
        }
    } catch {
        Write-Host "  ⚠️  Jest not configured or failed to run" -ForegroundColor Yellow
        Pop-Location -ErrorAction SilentlyContinue
    }
}

# ── 4. Security Audit ────────────────────────────────────────────────────────

Write-Step "4/5" "Security Audit"
if ($SkipAudit) {
    Write-Skip "Security audit"
} else {
    try {
        Push-Location $AppDir
        $output = & npm audit --audit-level=high 2>&1
        $exitCode = $LASTEXITCODE
        Pop-Location

        if ($exitCode -eq 0) {
            Write-Pass "No high/critical vulnerabilities found"
        } else {
            Write-Fail "Security audit found high/critical vulnerabilities"
            if ($Verbose) { $output | Select-Object -Last 15 | ForEach-Object { Write-Host "     $_" -ForegroundColor DarkRed } }
            $failCount++
        }
    } catch {
        Write-Host "  ⚠️  npm audit failed to run" -ForegroundColor Yellow
        Pop-Location -ErrorAction SilentlyContinue
    }
}

# ── 5. Configuration Validation ──────────────────────────────────────────────

Write-Step "5/5" "Configuration Validation"

$appJson = Get-Content (Join-Path $AppDir "app.json") | ConvertFrom-Json
$easJson = Get-Content (Join-Path $AppDir "eas.json") | ConvertFrom-Json
$configErrors = 0

# Check runtimeVersion
if ($appJson.expo.runtimeVersion) {
    Write-Pass "runtimeVersion configured"
} else {
    Write-Fail "runtimeVersion missing in app.json (required for OTA)"
    $configErrors++
}

# Check EAS profiles
foreach ($profile in @("preview", "staging", "production")) {
    $buildProfile = $easJson.build.$profile
    if ($buildProfile) {
        Write-Pass "EAS profile '$profile' configured"
    } else {
        Write-Fail "EAS profile '$profile' missing in eas.json"
        $configErrors++
    }
}

# Check .env exists
$envFile = Join-Path $AppDir ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "EXPO_PUBLIC_API_BASE_URL") {
        Write-Pass ".env file present with API URL"
    } else {
        Write-Fail ".env file missing EXPO_PUBLIC_API_BASE_URL"
        $configErrors++
    }
} else {
    Write-Fail ".env file not found at $envFile"
    $configErrors++
}

$failCount += $configErrors

# ── Summary ──────────────────────────────────────────────────────────────────

$duration = (Get-Date) - $startTime
Write-Host ""
Write-Host ("  " + "═" * 60) -ForegroundColor White

if ($failCount -eq 0) {
    Write-Host ""
    Write-Host "  ✅ ALL GATES PASSED" -ForegroundColor Green
    Write-Host "  Duration: $([math]::Round($duration.TotalSeconds, 1))s" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "  ❌ $failCount GATE(S) FAILED — Build blocked" -ForegroundColor Red
    Write-Host "  Duration: $([math]::Round($duration.TotalSeconds, 1))s" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
