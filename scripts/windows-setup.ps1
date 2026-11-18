<#
.SYNOPSIS
    FSP Windows dev-environment installer (no Docker Desktop).

.DESCRIPTION
    Installs and configures a container engine for FSP development on Windows:

      -Engine podman   (DEFAULT — recommended)  Podman Desktop + WSL2 machine +
                                                docker-compose wrapper so
                                                "podman compose" just works.
      -Engine rancher                            Rancher Desktop (moby/dockerd
                                                engine => real "docker compose"
                                                semantics, auto started).

    Also (always): enables WSL2 + VirtualMachinePlatform, installs Git for Windows
    (needed for the repo's bash scripts, e.g. dev-pki.sh).

    With -InstallToolchain additionally installs Temurin JDK 25 and Bun.

    Idempotent: safe to re-run; every step checks for existing state first.
    After a feature-enable step a REBOOT may be required — the script tells you.

.USAGE
    # recommended (run in an elevated PowerShell)
    powershell -ExecutionPolicy Bypass -File scripts\windows-setup.ps1

    # Rancher Desktop instead of Podman
    powershell -ExecutionPolicy Bypass -File scripts\windows-setup.ps1 -Engine rancher

    # also install JDK 25 + Bun + Git
    powershell -ExecutionPolicy Bypass -File scripts\windows-setup.ps1 -InstallToolchain

#>
[CmdletBinding()]
param(
    [ValidateSet('podman', 'rancher')] [string] $Engine = 'podman',
    [switch] $InstallToolchain,
    [switch] $SkipRebootNote
)

$ErrorActionPreference = 'Stop'
$Info  = { param($m) Write-Host  "[setup] $m" -ForegroundColor Cyan }
$Step  = { param($m) Write-Host  "[step ] $m" -ForegroundColor Yellow }
$Good  = { param($m) Write-Host  "[ ok  ] $m" -ForegroundColor Green }
$WarnM = { param($m) Write-Host  "[warn ] $m" -ForegroundColor DarkYellow }

function Step([string]$m) { & $Step $m }
function Info([string]$m) { & $Info $m }
function Good([string]$m) { & $Good $m }
function Warn([string]$m) { & $WarnM $m }

# ---------------------------------------------------------------- elevation
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Administrator rights are required (feature enablement, machine install). Relaunching elevated..."
    # preserve original args through the elevated relaunch
    $argList = @('-ExecutionPolicy', 'Bypass', '-File', "'$PSCommandPath'", '-Engine', $Engine)
    if ($InstallToolchain) { $argList += '-InstallToolchain' }
    if ($SkipRebootNote)   { $argList += '-SkipRebootNote' }
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    exit
}

# ---------------------------------------------------------------- helpers
function Winget-Install {
    param([string]$Id, [string]$Name)
    Step "Installing $Name ($Id) via winget..."
    winget install --id $Id --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        # app source may be msstore/winget-only or already installed; report but continue
        Warn "winget reported an issue installing $Name (exit $LASTEXITCODE). Continuing — check manually later."
    } else {
        Good "$Name installed"
    }
}

# ---------------------------------------------------------------- checks
Write-Host ""
Write-Host "=== FSP Windows setup — engine: $Engine ===" -ForegroundColor Magenta
Write-Host ""

$os = [System.Environment]::OSVersion.Version
if ($os.Build -lt 19044) {
    throw "Windows 10 build 19044+ (21H2) or Windows 11 is required (WSL2 + modern podman). Build is $($os.Build)."
}
Good "Windows build $($os.Build) — WSL2-capable"

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -ne 'AMD64') { throw "x64 required; found $arch" }
Good "x64 architecture"

# Virtualization must be available (Hyper-V/WSL2 needs it even on podman/lima VMs)
if ((Get-CimInstance Win32_ComputerSystem).HypervisorPresent) {
    Good "Hypervisor present — WSL2 will work"
} else {
    Warn "Hypervisor not detected. If steps fail later, enable Intel VT-x/AMD-V in BIOS."
}

# ------------------------------------------------------- 1. WSL2 + features
Step "Enabling Windows features: WSL + VirtualMachinePlatform..."
$needReboot = $false
foreach ($feature in 'Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') {
    $state = (Get-WindowsOptionalFeature -Online -FeatureName $feature).State
    if ($state -ne 'Enabled') {
        dism.exe /Online /Enable-Feature /FeatureName:$feature /All /NoRestart | Out-Null
        $needReboot = $true
        Info "enabled feature $feature"
    } else {
        Good "feature $feature already enabled"
    }
}
if (Get-Command wsl -ErrorAction SilentlyContinue) {
    wsl --update 2>$null | Out-Null
    wsl --set-default-version 2 2>$null | Out-Null
    Good "WSL kernel current, default version = 2"
}
if ($needReboot) {
    Write-Host ""
    Write-Warning "Windows features were enabled. A REBOOT IS REQUIRED before podman/lima VMs can start."
    if (-not $SkipRebootNote) {
        Write-Host "After reboot, re-run this script (it is idempotent) or continue manually."
    }
}

# ------------------------------------------------------- 2. Git for Windows
Step "Checking Git for Windows (needed for bash scripts: make pki / dev-pki.sh)..."
if (Get-Command git -ErrorAction SilentlyContinue) {
    Good "git already installed: $((git --version))"
} else {
    Winget-Install -Id 'Git.Git' -Name 'Git'
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Warn "git still not on PATH; open a NEW terminal after install." }
}

# ------------------------------------------------------- 3. Engine
$podmanCandidates = @(
    "$env:LOCALAPPDATA\Programs\Podman Desktop\resources\bin\podman.exe",   # bundled CLI (Podman Desktop < newer layouts)
    "$env:LOCALAPPDATA\Programs\Podman Desktop\resources\bin\podman\podman.exe",
    "$env:ProgramFiles\Podman\podman.exe"
)
function Find-Podman {
    if (Get-Command podman -ErrorAction SilentlyContinue) { return (Get-Command podman).Source }
    foreach ($c in $podmanCandidates) { if (Test-Path $c) { return $c } }
    return $null
}

if ($Engine -eq 'podman') {
    Step "Installing Podman Desktop ($Engine engine selected)..."
    Winget-Install -Id 'RedHat.PodmanDesktop' -Name 'podmanDesktop'
    Start-Sleep -Seconds 2

    $podman = Find-Podman
    if (-not $podman) {
        Warn "podman CLI not found after install. Podman Desktop bundles it:"
        Info "Open Podman Desktop once (Start Menu > Podman Desktop) — its setup wizard installs the podman CLI + machine."
        Info "Then re-run this script — the machine init below will be skipped if you did it in the UI."
    } else {
        & $podman --version
        # add bundled CLI to user PATH if found there but not on PATH
        $candDir = Split-Path $podman
        if ((Get-Command podman -ErrorAction SilentlyContinue) -eq $null) {
            [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$candDir", 'User')
            Good "added podman dir to user PATH: $candDir (new terminals required)"
        }
        Step "Initializing podman machine (WSL2 provider, start now)..."
        $machines = & $podman machine list --format json 2>$null | ConvertFrom-Json
        if ($machines -and $machines.Count -gt 0) {
            $running = $machines | Where-Object { $_.State -eq 'running' } | Select-Object -First 1
            if ($running) { Good "podman machine '$($running.Name)' already running" }
            else { & $podman machine start | Out-Host; Good "podman machine started" }
        } else {
            # --now creates AND starts; WSL backend is the default on Windows Podman 5+
            & $podman machine init --now | Out-Host
            if ($LASTEXITCODE -eq 0) { Good "podman machine created + started" }
            else { Warn "podman machine init failed (exit $LASTEXITCODE). Usually a missing reboot (WSL2) — reboot and re-run." }
        }
    }

    # ------------- docker-compose wrapper (makes `podman compose` work)
    $fspBin = Join-Path $env:LOCALAPPDATA 'FSP\bin'
    New-Item -ItemType Directory -Force -Path $fspBin | Out-Null
    $dc = Join-Path $fspBin 'docker-compose.exe'
    if (Test-Path $dc) { Good "docker-compose wrapper already present: $dc" }
    else {
        Step "Downloading docker compose for Windows (standalone, no Docker Desktop)..."
        $url = 'https://github.com/docker/compose/releases/latest/download/docker-compose-windows-x86_64.exe'
        try {
            [Net.ServicePointManager]::SecurityProtocol = 'Tls12'
            Invoke-WebRequest -Uri $url -OutFile $dc -UseBasicParsing
            Good "saved $dc"
            if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
                [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$fspBin", 'User')
                Good "added $fspBin to user PATH (new terminals required)"
            }
        } catch { Warn "docker compose download failed: $_  — you can still use 'podman-compose' (pip install podman-compose)" }
    }
} else {
    Step "Installing Rancher Desktop ($Engine engine selected)..."
    Winget-Install -Id 'SUSE.RancherDesktop' -Name 'rancherDesktop'
    Good "Rancher Desktop installed"

    # best-effort preconfig: moby(dockerd) engine, WSL2 provider, autostart, k8s off
    $rd = Join-Path $env:APPDATA 'rancher-desktop\settings.json'
    if (Test-Path $rd) {
        Step "writing Rancher Desktop preferred settings (moby engine, WSL2, k8s off, autostart)..."
        try {
            $json = Get-Content $rd -Raw | ConvertFrom-Json
            $json | Add-Member -NotePropertyName 'kubernetes' -NotePropertyValue @{ enabled = $false } -Force
            $json | Add-Member -NotePropertyName 'containerEngine' -NotePropertyValue @{ name = 'moby' } -Force
            $json | Add-Member -NotePropertyName 'wsl' -NotePropertyValue @{ integrateDefaultDistro = $true } -Force
            $json | Add-Member -NotePropertyName 'application' -NotePropertyValue @{ startInBackground = $true; autoStart = $true } -Force
            $json | ConvertTo-Json -Depth 10 | Set-Content $rd -Encoding utf8
            Good "settings preconfigured (moby engine => real docker/docker compose CLI)"
        } catch { Warn "could not rewrite settings.json ($_) — configure in Preferences (see docs/windows-dev.md, Rancher section)" }
    } else {
        Info "No settings.json yet — start Rancher Desktop once and pick:"
        Info "  Container Engine: dockerd (moby)   Virtual Machine: WSL2   Kubernetes: OFF"
    }
}

# ------------------------------------------------------- 4. optional toolchain
if ($InstallToolchain) {
    Step "Installing Temurin JDK 25 (project pins java 25)..."
    Winget-Install -Id 'EclipseAdoptium.Temurin.25.JDK' -Name 'java' # tolerable if unavailable; use WSL sdkman fallback
    if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
        Warn "java 25 not on PATH after install (open NEW terminal). Fallback: WSL2 Ubuntu + sdkman (.sdkmanrc in repo root)."
    } else { Good "java on PATH: $((java -version) 2>&1 | Select-Object -First 1)" }

    Step "Installing Bun (frontend)..."
    Winget-Install -Id 'Oven-sh.Bun' -Name 'bun'
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { Warn "bun not on PATH yet (open NEW terminal, or run: powershell -c \"irm bun.sh/install.ps1|iex\")" }
    else { Good "bun: $((bun --version))" }
}

# ------------------------------------------------------- 5. verify
Write-Host ""
Step "Verification..."
if ($Engine -eq 'podman') {
    $podman = Find-Podman
    if ($podman) {
        & $podman machine list | Write-Host
        & $podman compose version 2>$null | Write-Host
        if (Get-Command docker-compose -ErrorAction SilentlyContinue) { Good "docker-compose on PATH — podman compose will use it" }
        Good "Try: podman run --rm hello-world"
    }
} else {
    Info "Start Rancher Desktop from the Start Menu, wait for the tray icon to settle, then try:"
    Info "  docker version && docker compose ls"
}
Write-Host ""
Good "Setup complete. Next steps: docs\windows-dev.md (full walkthrough incl. TigerBeetle on Windows)."
if ($needReboot) { Write-Host "" ; Write-Warning "REBOOT NOW to finish WSL2 feature enablement, then re-run or continue with docs\windows-dev.md." }
