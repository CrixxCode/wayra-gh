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
    Invoke-CheckedNativeCommand -Executable "..\env\Scripts\python.exe" -Arguments @("manage.py", "test")
    Invoke-CheckedNativeCommand -Executable "..\env\Scripts\python.exe" -Arguments @("manage.py", "spectacular", "--file", "schema.yml", "--validate")
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
