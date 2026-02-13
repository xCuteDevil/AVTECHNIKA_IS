Param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "help")]
    [string]$Command = "help"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Project root = parent of scripts\
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir

$env:BACKEND_PORT = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8000" }
$env:FRONTEND_PORT = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5173" }
$env:VITE_DEV_HTTPS = if ($env:VITE_DEV_HTTPS) { $env:VITE_DEV_HTTPS } else { "true" }
$env:FRONTEND_API_BASE = if ($env:FRONTEND_API_BASE) { $env:FRONTEND_API_BASE } else { "/api" }

$logsDir = Join-Path $Root "logs"
$pidsDir = Join-Path $Root ".pids"

New-Item -ItemType Directory -Force -Path $logsDir, $pidsDir | Out-Null

function Get-PortPids {
    param(
        $Port
    )

    $portInt = [int]$Port

    try {
        $conns = Get-NetTCPConnection -LocalPort $portInt -State Listen -ErrorAction Stop
        $conns | Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        @()
    }
}

function Kill-Port {
    param(
        $Port
    )

    $procIds = Get-PortPids -Port $Port
    if ($procIds.Count -gt 0) {
        Write-Host ("Killing processes on port {0}: {1}" -f $Port, ($procIds -join ', '))
        foreach ($procId in $procIds) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            } catch { }
        }
        Start-Sleep -Milliseconds 300
    }
}

function Stop-Backend {
    $backendPidFile = Join-Path $pidsDir "backend.pid"
    if (Test-Path $backendPidFile) {
        $procId = Get-Content $backendPidFile -ErrorAction SilentlyContinue
        if ($procId) {
            Write-Host "Stopping backend pid $procId"
            try {
                Stop-Process -Id [int]$procId -ErrorAction SilentlyContinue
            } catch { }
        }
        Remove-Item $backendPidFile -ErrorAction SilentlyContinue
    }
    Kill-Port -Port $env:BACKEND_PORT
}

function Stop-Frontend {
    $frontendPidFile = Join-Path $pidsDir "frontend.pid"
    if (Test-Path $frontendPidFile) {
        $procId = Get-Content $frontendPidFile -ErrorAction SilentlyContinue
        if ($procId) {
            Write-Host "Stopping frontend pid $procId"
            try {
                Stop-Process -Id [int]$procId -ErrorAction SilentlyContinue
            } catch { }
        }
        Remove-Item $frontendPidFile -ErrorAction SilentlyContinue
    }
    Kill-Port -Port $env:FRONTEND_PORT
}

function Start-Backend {
    Write-Host "Starting backend (uvicorn) on :$($env:BACKEND_PORT)"
    $backendLog = Join-Path $logsDir "backend.log"
    $backendPidFile = Join-Path $pidsDir "backend.pid"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.WorkingDirectory = $Root
    $psi.Arguments = "-NoExit -Command `"if (Test-Path 'venv/Scripts/Activate.ps1') { . 'venv/Scripts/Activate.ps1' }; uvicorn main:app --host 0.0.0.0 --port $($env:BACKEND_PORT) --reload *>> '$backendLog'`""
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $psi.UseShellExecute = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    if ($p) {
        $p.Id | Out-File -FilePath $backendPidFile -Encoding ascii -Force
    }
}

function Start-Frontend {
    Write-Host "Starting frontend (Vite) on :$($env:FRONTEND_PORT) (HTTPS=$($env:VITE_DEV_HTTPS), API_BASE=$($env:FRONTEND_API_BASE))"
    $frontendLog = Join-Path $logsDir "frontend.log"
    $frontendPidFile = Join-Path $pidsDir "frontend.pid"
    $frontendDir = Join-Path $Root "avtechnika-dashboard"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.WorkingDirectory = $frontendDir
    $psi.Arguments = "-NoExit -Command `"`$env:VITE_DEV_HTTPS='$($env:VITE_DEV_HTTPS)'; `$env:VITE_API_BASE='$($env:FRONTEND_API_BASE)'; npm run dev -- --host *>> '$frontendLog'`""
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $psi.UseShellExecute = $true

    $p = [System.Diagnostics.Process]::Start($psi)
    if ($p) {
        $p.Id | Out-File -FilePath $frontendPidFile -Encoding ascii -Force
    }
}

function Show-Status {
    $backendPidFile = Join-Path $pidsDir "backend.pid"
    $frontendPidFile = Join-Path $pidsDir "frontend.pid"

    $backendPid = if (Test-Path $backendPidFile) { Get-Content $backendPidFile -ErrorAction SilentlyContinue } else { "-" }
    $frontendPid = if (Test-Path $frontendPidFile) { Get-Content $frontendPidFile -ErrorAction SilentlyContinue } else { "-" }

    Write-Host "Backend PID:  $backendPid"
    Write-Host "Frontend PID: $frontendPid"
    Write-Host "Ports:"

    try {
        Get-NetTCPConnection -State Listen |
            Where-Object { $_.LocalPort -in @([int]$env:BACKEND_PORT, [int]$env:FRONTEND_PORT) } |
            Select-Object LocalAddress, LocalPort, OwningProcess
    } catch {
        Write-Host "(Get-NetTCPConnection not available or needs elevation)"
    }
}

function Show-Logs {
    $backendLog = Join-Path $logsDir "backend.log"
    $frontendLog = Join-Path $logsDir "frontend.log"
    Write-Host "Tailing logs (Ctrl+C to stop)..."
    Get-Content $backendLog, $frontendLog -Wait -Tail 50
}

switch ($Command) {
    "start" {
        Start-Backend
        Start-Frontend
        Start-Sleep -Seconds 1
        Show-Status
    }
    "stop" {
        Stop-Frontend
        Stop-Backend
        Show-Status
    }
    "restart" {
        Stop-Frontend
        Stop-Backend
        Start-Backend
        Start-Frontend
        Start-Sleep -Seconds 1
        Show-Status
    }
    "status" {
        Show-Status
    }
    "logs" {
        Show-Logs
    }
    Default {
        Write-Host "Usage: powershell -File scripts/devctl.ps1 <command>"
        Write-Host "Commands:"
        Write-Host "  start      Start backend and frontend"
        Write-Host "  stop       Stop backend and frontend"
        Write-Host "  restart    Restart both (stop -> start)"
        Write-Host "  status     Show PIDs and listening ports"
        Write-Host "  logs       Tail both logs"
        Write-Host ""
        Write-Host "Env vars:"
        Write-Host "  BACKEND_PORT (default 8000)"
        Write-Host "  FRONTEND_PORT (default 5173)"
        Write-Host "  VITE_DEV_HTTPS (default true)"
        Write-Host "  FRONTEND_API_BASE (default /api)"
    }
}

