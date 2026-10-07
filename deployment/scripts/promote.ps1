<#
.SYNOPSIS
    RTX5 Channel Promotion Script
.DESCRIPTION
    Safely promotes an OTA update from one channel to another with pre-flight checks.
.PARAMETER From
    Source channel (preview, staging)
.PARAMETER To
    Target channel (staging, production)
.PARAMETER Message
    Update message for the OTA publish
.PARAMETER DryRun
    If set, only shows what would happen without executing
.EXAMPLE
    .\deployment\scripts\promote.ps1 -From preview -To staging -Message "rc: trade screen fixes"
    .\deployment\scripts\promote.ps1 -From staging -To production -Message "v1.0.1: hotfix" -DryRun
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("preview", "staging")]
    [string]$From,

    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "production")]
    [string]$To,

    [Parameter(Mandatory=$false)]
    [string]$Message = "",

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$AppDir = Join-Path $PSScriptRoot "..\..\rtx5-app"

# ── Validation ────────────────────────────────────────────────────────────────

# Prevent skipping channels
$validPromotions = @{
    "preview"  = "staging"
    "staging"  = "production"
}

if ($validPromotions[$From] -ne $To) {
    Write-Host ""
    Write-Host "  ❌ Invalid promotion path: $From → $To" -ForegroundColor Red
    Write-Host "  Valid paths:" -ForegroundColor Yellow
    Write-Host "    • preview  → staging" -ForegroundColor Yellow
    Write-Host "    • staging  → production" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Require message for production promotions
if ($To -eq "production" -and [string]::IsNullOrWhiteSpace($Message)) {
    Write-Host ""
    Write-Host "  ❌ Production promotions require a -Message parameter" -ForegroundColor Red
    Write-Host "  Example: -Message 'v1.0.1: critical hotfix for trade execution'" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Default message
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "promote: $From → $To ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
}

# ── Banner ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor White
Write-Host "  ║            RTX5 — Channel Promotion                     ║" -ForegroundColor White
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor White
Write-Host ""
Write-Host "  From:    $From" -ForegroundColor Cyan
Write-Host "  To:      $To" -ForegroundColor Cyan
Write-Host "  Message: $Message" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "  Mode:    DRY RUN (no changes will be made)" -ForegroundColor Yellow
}
Write-Host ""

# ── Production Safety Gate ────────────────────────────────────────────────────

if ($To -eq "production" -and !$DryRun) {
    Write-Host "  ⚠️  You are about to publish to PRODUCTION" -ForegroundColor Yellow
    Write-Host "  This will affect ALL end users." -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "  Type 'CONFIRM' to proceed"
    if ($confirm -ne "CONFIRM") {
        Write-Host ""
        Write-Host "  ❌ Promotion cancelled" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
    Write-Host ""
}

# ── Pre-Flight Checks ────────────────────────────────────────────────────────

Write-Host "  Running pre-flight checks..." -ForegroundColor DarkGray

# TypeScript check
Push-Location $AppDir
try {
    $null = & npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ TypeScript check failed — promotion blocked" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "  ✅ TypeScript clean" -ForegroundColor Green
} catch {
    Write-Host "  ❌ TypeScript check threw exception — promotion blocked" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ── Execute Promotion ─────────────────────────────────────────────────────────

$command = "eas update --channel $To --message `"$Message`""

if ($DryRun) {
    Write-Host ""
    Write-Host "  [DRY RUN] Would execute:" -ForegroundColor Yellow
    Write-Host "  cd rtx5-app && $command" -ForegroundColor White
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "  Publishing OTA update to '$To' channel..." -ForegroundColor Cyan
Write-Host ""

Push-Location $AppDir
try {
    & eas update --channel $To --message "$Message"
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║  ✅ Promotion successful: $From → $To" -ForegroundColor Green
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor DarkGray
    if ($To -eq "staging") {
        Write-Host "    1. Install on QA devices and run regression suite" -ForegroundColor DarkGray
        Write-Host "    2. Monitor crash telemetry for 48-hour soak period" -ForegroundColor DarkGray
        Write-Host "    3. When ready: .\deployment\scripts\promote.ps1 -From staging -To production" -ForegroundColor DarkGray
    } else {
        Write-Host "    1. Monitor crash-free rate (target: >= 99.5%)" -ForegroundColor DarkGray
        Write-Host "    2. Verify OTA adoption rate > 80% within 24 hours" -ForegroundColor DarkGray
        Write-Host "    3. Spot-check critical trading flows on production" -ForegroundColor DarkGray
    }
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  ❌ Promotion failed with exit code $exitCode" -ForegroundColor Red
    Write-Host "  Check the EAS Dashboard for details." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
