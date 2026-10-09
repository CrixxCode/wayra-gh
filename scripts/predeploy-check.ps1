Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedNativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter()]
        [string[]]$Arguments = @()
    )

    $output = & $Executable @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $formattedArgs = $Arguments -join " "
        throw "Command failed with exit code ${exitCode}: $Executable $formattedArgs"
    }

    return $output
}

Write-Host "Checking git tree..."
$status = Invoke-CheckedNativeCommand -Executable "git" -Arguments @("status", "--porcelain")
if ($status) {
    Write-Error "Git tree is dirty. Commit or stash changes before deploy."
    exit 1
}

Write-Host "Running backend tests..."
Push-Location backend
try {
    # El entorno del proyecto vive en backend/.venv (seccion 8 de AGENTS.md); `env` y
    # `..\env` quedan como respaldo para entornos creados con la guia anterior.
    $python = @(".venv\Scripts\python.exe", "env\Scripts\python.exe", "..\env\Scripts\python.exe") |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
    if (-not $python) {
        Write-Error "No se encontro el entorno virtual del backend (backend\.venv)."
        exit 1
    }
    Invoke-CheckedNativeCommand -Executable $python -Arguments @("manage.py", "test")
    Invoke-CheckedNativeCommand -Executable $python -Arguments @("manage.py", "spectacular", "--file", "schema.yml", "--validate")
}
finally {
    Pop-Location
}

Write-Host "Running frontend lint/test/build..."
Push-Location frontend
try {
    Invoke-CheckedNativeCommand -Executable "npm.cmd" -Arguments @("run", "lint")
    Invoke-CheckedNativeCommand -Executable "npm.cmd" -Arguments @("run", "test:ci")
    Invoke-CheckedNativeCommand -Executable "npm.cmd" -Arguments @("run", "build:ci")
}
finally {
    Pop-Location
}

Write-Host "Predeploy checks passed."
