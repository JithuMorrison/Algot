param(
    [switch]$RestartServices
)

$ErrorActionPreference = 'Stop'
$launcherDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $launcherDirectory
$backendDirectory = Join-Path $root 'backend'
$pythonEnvironment = Join-Path $backendDirectory '.venv'
$python = Join-Path $pythonEnvironment 'Scripts\python.exe'
$nodeDirectory = Join-Path $root '.tools\node-v24.21.0-win-x64'
$node = Join-Path $nodeDirectory 'node.exe'
$npm = Join-Path $nodeDirectory 'npm.cmd'
$vite = Join-Path $root 'node_modules\vite\bin\vite.js'
$requirements = Join-Path $backendDirectory 'requirements.txt'
$packageLock = Join-Path $root 'package-lock.json'
$watchlist = Join-Path $backendDirectory 'data\stock_watchlist.json'

function Invoke-SetupCommand {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )
    Push-Location -LiteralPath $WorkingDirectory
    try {
        & $FilePath @ArgumentList
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Setup command failed: $FilePath $($ArgumentList -join ' ')"
    }
}

function Get-PortListeners {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listenerProcessId in ($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        Get-CimInstance Win32_Process -Filter "ProcessId = $listenerProcessId" -ErrorAction SilentlyContinue
    }
}

function Get-OwnedListener {
    param(
        [int]$Port,
        [string]$ExpectedExecutable,
        [string]$CommandFragment
    )
    $listeners = @(Get-PortListeners -Port $Port)
    foreach ($listener in $listeners) {
        if (-not [string]::Equals($listener.ExecutablePath, $ExpectedExecutable, [StringComparison]::OrdinalIgnoreCase) -or
            -not $listener.CommandLine -or
            $listener.CommandLine.IndexOf($CommandFragment, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port $Port is already in use by another process. Northstar did not stop it."
        }
    }
    return $listeners
}

if (-not (Test-Path -LiteralPath $python)) {
    $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
        Invoke-SetupCommand -FilePath $pythonLauncher.Source -ArgumentList @('-3', '-m', 'venv', $pythonEnvironment) -WorkingDirectory $root
    } else {
        $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue
        if (-not $systemPython) {
            throw 'Python 3 is required. Install Python 3, then run install-app.ps1 again.'
        }
        Invoke-SetupCommand -FilePath $systemPython.Source -ArgumentList @('-m', 'venv', $pythonEnvironment) -WorkingDirectory $root
    }
}

if (-not (Test-Path -LiteralPath $node)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $nodeCommand -or -not $npmCommand) {
        throw 'Node.js is required. Install Node.js or restore the project .tools runtime, then run install-app.ps1 again.'
    }
    $node = $nodeCommand.Source
    $npm = $npmCommand.Source
}

$viteCommand = Join-Path $root 'node_modules\vite\bin\vite.js'
if ($RestartServices) {
    $frontendProcesses = @(Get-OwnedListener -Port 5173 -ExpectedExecutable $node -CommandFragment $viteCommand)
    $backendProcesses = @(Get-OwnedListener -Port 8000 -ExpectedExecutable $python -CommandFragment 'app.main:app')
    foreach ($serviceProcess in @($frontendProcesses) + @($backendProcesses)) {
        Stop-Process -Id $serviceProcess.ProcessId -Force
    }
}

if (-not (Test-Path -LiteralPath $watchlist)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $watchlist) -Force | Out-Null
    [System.IO.File]::WriteAllText($watchlist, "[`r`n  `"PNB`",`r`n  `"SOUTHBANK`"`r`n]", [System.Text.UTF8Encoding]::new($false))
}

$appData = Join-Path $env:LOCALAPPDATA 'Northstar'
$dependencyDirectory = Join-Path $appData 'dependencies'
New-Item -ItemType Directory -Path $dependencyDirectory -Force | Out-Null
$pathHash = [Security.Cryptography.SHA256]::Create()
try {
    $projectHash = [BitConverter]::ToString($pathHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-', '').Substring(0, 16)
} finally {
    $pathHash.Dispose()
}
$backendMarker = Join-Path $dependencyDirectory "backend-$projectHash.sha256"
$frontendMarker = Join-Path $dependencyDirectory "frontend-$projectHash.sha256"
$requirementsHash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
$backendImportsPresent = $false
try {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $python -c 'import fastapi, uvicorn, kiteconnect, pydantic_settings' 2>$null
    $backendImportsPresent = $LASTEXITCODE -eq 0
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
if (-not $backendImportsPresent -or -not (Test-Path -LiteralPath $backendMarker) -or (Get-Content -LiteralPath $backendMarker -Raw).Trim() -ne $requirementsHash) {
    Write-Host 'Installing backend dependencies...'
    Invoke-SetupCommand -FilePath $python -ArgumentList @('-m', 'pip', 'install', '-r', $requirements) -WorkingDirectory $backendDirectory
    Set-Content -LiteralPath $backendMarker -Value $requirementsHash -Encoding ASCII
}

if (Test-Path -LiteralPath $packageLock) {
    $frontendHash = (Get-FileHash -LiteralPath $packageLock -Algorithm SHA256).Hash
} else {
    $frontendHash = (Get-FileHash -LiteralPath (Join-Path $root 'package.json') -Algorithm SHA256).Hash
}
if (-not (Test-Path -LiteralPath $vite) -or -not (Test-Path -LiteralPath $frontendMarker) -or (Get-Content -LiteralPath $frontendMarker -Raw).Trim() -ne $frontendHash) {
    Write-Host 'Installing frontend dependencies...'
    if (Test-Path -LiteralPath $packageLock) {
        Invoke-SetupCommand -FilePath $npm -ArgumentList @('ci') -WorkingDirectory $root
    } else {
        Invoke-SetupCommand -FilePath $npm -ArgumentList @('install') -WorkingDirectory $root
    }
    Set-Content -LiteralPath $frontendMarker -Value $frontendHash -Encoding ASCII
}

$iconPath = Join-Path $appData 'Northstar.ico'
New-Item -ItemType Directory -Path $appData -Force | Out-Null

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 64, 64
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(11, 14, 19))
$markPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(148, 201, 157)), 4
$markPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$markPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLines($markPen, [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 9, 34),
    (New-Object System.Drawing.Point 19, 34),
    (New-Object System.Drawing.Point 25, 20),
    (New-Object System.Drawing.Point 34, 46),
    (New-Object System.Drawing.Point 41, 29),
    (New-Object System.Drawing.Point 47, 34),
    (New-Object System.Drawing.Point 56, 34)
))
$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$iconStream = [System.IO.File]::Create($iconPath)
$icon.Save($iconStream)
$iconStream.Dispose()
$icon.Dispose()
$graphics.Dispose()
$markPen.Dispose()
$bitmap.Dispose()

$wshShell = New-Object -ComObject WScript.Shell
$launcher = Join-Path $launcherDirectory 'launch-app.vbs'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$startMenuPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Northstar Trading Desk'
New-Item -ItemType Directory -Path $startMenuPath -Force | Out-Null

foreach ($shortcutPath in @(
    (Join-Path $desktopPath 'Northstar Trading Desk.lnk'),
    (Join-Path $startMenuPath 'Northstar Trading Desk.lnk')
)) {
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $wscript
    $shortcut.Arguments = "//B //Nologo `"$launcher`""
    $shortcut.WorkingDirectory = $root
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Description = 'Start Northstar and open the trading desk in Chrome'
    $shortcut.Save()
}

Write-Host ''
Write-Host 'Northstar shortcuts were created on the Desktop and in the Start menu.'
Write-Host 'Starting Northstar now...'
if ($RestartServices) {
    $launcherScript = Join-Path $launcherDirectory 'launch-app.ps1'
    $launcherProcess = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$launcherScript`"", '-RestartServices') `
        -WorkingDirectory $root -PassThru -Wait
    if ($launcherProcess.ExitCode -ne 0) {
        throw 'Northstar could not restart. Check the error message and launcher logs.'
    }
} else {
    Start-Process -FilePath $wscript -ArgumentList @('//B', '//Nologo', "`"$launcher`"") -WorkingDirectory $root | Out-Null
}
