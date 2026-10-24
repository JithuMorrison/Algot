param(
    [switch]$RestartServices
)

$ErrorActionPreference = 'Stop'

$launcherDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $launcherDirectory
$logDirectory = Join-Path $env:LOCALAPPDATA 'Northstar\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'launcher.log'

function Write-LaunchLog {
    param([string]$Message)
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $Message"
}

function Test-LocalEndpoint {
    param([string]$Uri)
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    } catch {
        return $false
    }
}

function Wait-ForEndpoint {
    param(
        [string]$Uri,
        [int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalEndpoint -Uri $Uri) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Find-Chrome {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    $chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($chromeCommand) {
        return $chromeCommand.Source
    }
    return $null
}

function Get-ListenerProcesses {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listenerProcessId in ($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        Get-CimInstance Win32_Process -Filter "ProcessId = $listenerProcessId" -ErrorAction SilentlyContinue
    }
}

function Stop-OwnedService {
    param(
        [int]$Port,
        [string]$ExpectedExecutable,
        [string]$CommandFragment
    )
    foreach ($process in Get-ListenerProcesses -Port $Port) {
        $isExpectedExecutable = [string]::Equals($process.ExecutablePath, $ExpectedExecutable, [StringComparison]::OrdinalIgnoreCase)
        $hasExpectedCommand = $process.CommandLine -and $process.CommandLine.IndexOf($CommandFragment, [StringComparison]::OrdinalIgnoreCase) -ge 0
        if ($isExpectedExecutable -and $hasExpectedCommand) {
            Stop-Process -Id $process.ProcessId -Force
            Write-LaunchLog "Stopped Northstar service process $($process.ProcessId) on port $Port for setup refresh."
        } else {
            throw "Port $Port is already in use by another process. Northstar did not stop it."
        }
    }
}

try {
    $backendHealth = 'http://127.0.0.1:8000/api/health'
    $frontendUrl = 'http://127.0.0.1:5173/'
    $python = Join-Path $root 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        throw 'The backend Python environment is missing. Run install-app.ps1 again.'
    }

    $nodeDirectory = Join-Path $root '.tools\node-v24.21.0-win-x64'
    $node = Join-Path $nodeDirectory 'node.exe'
    $vite = Join-Path $root 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $node)) {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($nodeCommand) {
            $node = $nodeCommand.Source
        }
    }
    if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $vite)) {
        throw 'The frontend runtime or dependencies are missing. Run install-app.ps1 again.'
    }

    if ($RestartServices) {
        Stop-OwnedService -Port 5173 -ExpectedExecutable $node -CommandFragment $vite
        Stop-OwnedService -Port 8000 -ExpectedExecutable $python -CommandFragment 'app.main:app'
    }

    if (-not (Test-LocalEndpoint -Uri $backendHealth)) {
        $backendOut = Join-Path $logDirectory 'backend.out.log'
        $backendErr = Join-Path $logDirectory 'backend.error.log'
        Start-Process -FilePath $python `
            -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
            -WorkingDirectory (Join-Path $root 'backend') `
            -WindowStyle Hidden `
            -RedirectStandardOutput $backendOut `
            -RedirectStandardError $backendErr | Out-Null
        if (-not (Wait-ForEndpoint -Uri $backendHealth -TimeoutSeconds 45)) {
            throw "The backend did not start. Check $backendErr."
        }
    } elseif ($RestartServices) {
        $backendOwner = Get-ListenerProcesses -Port 8000 | Select-Object -First 1
        if (-not $backendOwner -or -not $backendOwner.CommandLine -or -not [string]::Equals($backendOwner.ExecutablePath, $python, [StringComparison]::OrdinalIgnoreCase) -or $backendOwner.CommandLine.IndexOf('app.main:app', [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw 'Port 8000 is serving another application. Northstar did not replace it.'
        }
    }

    if (-not (Test-LocalEndpoint -Uri $frontendUrl)) {
        $frontendOut = Join-Path $logDirectory 'frontend.out.log'
        $frontendErr = Join-Path $logDirectory 'frontend.error.log'
        Start-Process -FilePath $node `
            -ArgumentList @("`"$vite`"", '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
            -WorkingDirectory $root `
            -WindowStyle Hidden `
            -RedirectStandardOutput $frontendOut `
            -RedirectStandardError $frontendErr | Out-Null
        if (-not (Wait-ForEndpoint -Uri $frontendUrl -TimeoutSeconds 45)) {
            throw "The dashboard did not start. Check $frontendErr."
        }
    } elseif ($RestartServices) {
        $frontendOwner = Get-ListenerProcesses -Port 5173 | Select-Object -First 1
        if (-not $frontendOwner -or -not $frontendOwner.CommandLine -or -not [string]::Equals($frontendOwner.ExecutablePath, $node, [StringComparison]::OrdinalIgnoreCase) -or $frontendOwner.CommandLine.IndexOf($vite, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw 'Port 5173 is serving another application. Northstar did not replace it.'
        }
    }

    $chrome = Find-Chrome
    if ($chrome) {
        Start-Process -FilePath $chrome -ArgumentList @('--app=http://127.0.0.1:5173/') | Out-Null
        Write-LaunchLog 'Northstar started and opened in Chrome app mode.'
    } else {
        Start-Process $frontendUrl | Out-Null
        Write-LaunchLog 'Northstar started. Chrome was not found; opened the default browser.'
    }
} catch {
    Write-LaunchLog "Startup failed: $($_.Exception.Message)"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "Northstar could not start.`n`n$($_.Exception.Message)`n`nDetails: $logPath",
        'Northstar',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}
exit 0
