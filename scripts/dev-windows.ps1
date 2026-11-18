<#
.SYNOPSIS
    FSP dev commands for native Windows (make-equivalent, no Docker Desktop).

.DESCRIPTION
    Mirrors the repo Makefile for Windows terminals. Container engine is auto-detected:
    podman first, then docker (works with both Podman Desktop and Rancher Desktop).
    TigerBeetle runs as a CONTAINER on Windows (the repo binary is a Linux ELF) with
    seccomp=unconfined + pinned image 0.17.9.

.USAGE
    powershell -ExecutionPolicy Bypass -File scripts\dev-windows.ps1 <command>
    commands: status | infra-up | infra-down | tb-init | tb-start | tb-stop | tb-reset
              stack-up | stack-down | pki | docs-refresh | docs-check | help
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('status', 'infra-up', 'infra-down', 'infra-init', 'tb-init', 'tb-start',
        'tb-stop', 'tb-reset', 'stack-up', 'stack-down', 'pki', 'docs-refresh', 'docs-check', 'help')]
    [string] $Command = 'help'
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path $PSScriptRoot
$TB_IMAGE = 'ghcr.io/tigerbeetle/tigerbeetle:0.17.9'   # bumps together with build.gradle.kts pin
$TB_NAME = 'fsp-tigerbeetle'
$TB_DATA = Join-Path $ROOT 'infrastructure\tigerbeetle-data'
$COMPOSE = Join-Path $ROOT 'infrastructure\docker-compose.yml'

function Resolve-CLI {
    foreach ($c in 'podman', 'docker') {
        if (Get-Command $c -ErrorAction SilentlyContinue) { return $c }
    }
    throw "No container CLI found. Run scripts\windows-setup.ps1 first (Podman or Rancher Desktop)."
}
$CLI = Resolve-CLI

function Invoke-Compose {
    param([string[]] $ArgsCompose)
    if ($CLI -eq 'podman') {
        if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
            docker-compose -f $COMPOSE @ArgsCompose
        } else {
            podman compose -f $COMPOSE @ArgsCompose
        }
    } else {
        docker compose -f $COMPOSE @ArgsCompose
    }
}

switch ($Command) {
    'help' {
        Write-Host "FSP dev on Windows — make-equivalents (engine: $CLI)" -ForegroundColor Magenta
        Write-Host @"
  status          engine + port overview
  infra-up        start PostgreSQL (container)
  infra-down      stop PostgreSQL
  tb-init         format TigerBeetle data file (container, seccomp unconfined)
  tb-start        start TigerBeetle 0.17.9 on 127.0.0.1:3000 (container)
  tb-stop         stop TigerBeetle container
  tb-reset        wipe TigerBeetle data
  stack-up        build + run core/idp/gateway/bff in containers
  stack-down      stop the container stack
  pki             regenerate dev PKI (bash -> Git for Windows)
  docs-refresh    regenerate docs/generated artifacts
  docs-check      fail if docs artifacts are stale (CI gate)
"@; break
    }

    'status' {
        Write-Host "engine: $CLI $(( & $CLI --version | Select-Object -First 1 ))" -ForegroundColor Cyan
        & $CLI ps -a --filter "name=fsp-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>$null
        foreach ($p in 5432, 3000, 8081, 8082, 8090, 8080, 8083, 5173) {
            $busy = (Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded
            Write-Host ("port {0,-5} {1}" -f $p, $(if ($busy) { 'OPEN' } else { 'closed' }))
        }
        break
    }

    'infra-up' {
        Invoke-Compose @('up', '-d')
        Start-Sleep -Seconds 3
        Invoke-Compose @('ps')
        break
    }

    'infra-down' { Invoke-Compose @('down'); break }

    'infra-init' { New-Item -ItemType Directory -Force -Path $TB_DATA | Out-Null; break }

    'tb-init' {
        & $CLI run --rm --user 0:0 `
            --security-opt seccomp=unconfined `
            -v "${TB_DATA}:/data" `
            --entrypoint /tigerbeetle $TB_IMAGE `
            format --cluster=0 --replica=0 --replica-count=1 /data/0_0.tigerbeetle 2>$null
        if ($LASTEXITCODE -ne 0) { Write-Host "[warn] format skipped/failed (exit $LASTEXITCODE) — usually 'already formatted'" -ForegroundColor DarkYellow }
        break
    }

    'tb-start' {
        & $PSScriptRoot\dev-windows.ps1 tb-init | Out-Null
        $existing = & $CLI ps -a --filter "name=$TB_NAME" --format "{{.ID}}" 2>$null
        if ($existing) {
            $state = (& $CLI ps -a --filter "name=$TB_NAME" --format "{{.State}}" | Select-Object -First 1)
            if ($state -eq 'Running') { Write-Host "[ ok  ] TigerBeetle already running"; break }
            & $CLI start $TB_NAME | Out-Null; Write-Host "[ ok  ] TigerBeetle (re)started"; break
        }
        & $CLI run -d --name $TB_NAME `
            -p 127.0.0.1:3000:3000 `
            --security-opt seccomp=unconfined `
            --ulimit nofile=65536:65536 `
            -v "${TB_DATA}:/data" `
            --entrypoint /tigerbeetle $TB_IMAGE `
            start --addresses=0.0.0.0:3000 /data/0_0.tigerbeetle | Out-Null
        Write-Host "[ ok  ] TigerBeetle container started on 127.0.0.1:3000 (data: infrastructure\tigerbeetle-data)"
        break
    }

    'tb-stop' {
        & $CLI stop $TB_NAME 2>$null | Out-Null
        & $CLI rm $TB_NAME 2>$null | Out-Null
        Write-Host "[ ok  ] TigerBeetle stopped/removed"
        break
    }

    'tb-reset' {
        & $PSScriptRoot\dev-windows.ps1 tb-stop
        Remove-Item $TB_DATA -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force -Path $TB_DATA | Out-Null
        & $PSScriptRoot\dev-windows.ps1 tb-init
        Write-Host "[ ok  ] TigerBeetle data reset — run dev-windows.ps1 tb-start"
        break
    }

    'stack-up' {
        Invoke-Compose @('--profile', 'stack', 'up', '-d', '--build', 'core', 'idp', 'gateway', 'bff')
        break
    }

    'stack-down' { Invoke-Compose @('--profile', 'stack', 'down'); break }

    'pki' {
        $bashExe = "${env:ProgramFiles}\Git\bin\bash.exe"
        if (-not (Test-Path $bashExe)) { throw "Git Bash not found — install Git for Windows (scripts\windows-setup.ps1 does it)." }
        & $bashExe -lc "cd '$ROOT' && bash infrastructure/pki/dev-pki.sh"
        Write-Host "[ ok  ] dev PKI regenerated (gitignored)"
        break
    }

    'docs-refresh' { node "$ROOT\docs\gen\refresh.cjs"; break }
    'docs-check'   { node "$ROOT\docs\gen\refresh.cjs" --check; break }
}
