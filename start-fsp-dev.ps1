<#
.SYNOPSIS
    One-click launcher for FSP dev on Windows.

.DESCRIPTION
    Runs scripts\dev-windows.ps1 dev with the correct execution policy
    and working directory so you can launch the whole stack (PostgreSQL,
    TigerBeetle, IDP, Core, Gateway, BFF, KYC plugin, and the SPA) with a
    single command — no need to type the full PowerShell invocation.

.USAGE
    Right-click → "Run with PowerShell"
    OR
    powershell -File start-fsp-dev.ps1
#>
[CmdletBinding()]
param(
    [switch] $NoStack   # if set, skips infra/TB/stack and only runs the SPA
)

$ErrorActionPreference = 'Stop'

# Ensure we run from the repo root regardless of where the user launches from
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $SCRIPT_DIR

# Allow running this script without pre-setting the execution policy
$policy = Get-ExecutionPolicy -Scope Process -ErrorAction SilentlyContinue
if ($policy -ne 'Bypass') {
    $env:PSExecutionPolicyPreference = 'Bypass'
}

Write-Host "=== FSP Dev Launcher ===" -ForegroundColor Magenta
Write-Host "Repo root: $SCRIPT_DIR" -ForegroundColor Cyan

if ($NoStack) {
    Write-Host "Launching SPA only..." -ForegroundColor Yellow
    & powershell -NoExit -Command "Set-Location -Path '$SCRIPT_DIR\frontend'; bun run dev"
} else {
    Write-Host "Launching full dev stack (infra + TigerBeetle + 5 services + SPA)..." -ForegroundColor Yellow
    & powershell -NoExit -Command "& '$SCRIPT_DIR\scripts\dev-windows.ps1' dev"
}
