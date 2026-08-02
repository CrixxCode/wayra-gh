param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required."
}

if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
    throw "git-filter-repo is required. Install it first."
}

$status = git status --porcelain
if (-not $Force -and $status) {
    throw "Working tree is not clean. Commit/stash changes first or use -Force."
}

Write-Host "Rewriting history to remove backend/.env ..."
git filter-repo --invert-paths --path backend/.env --force

Write-Host "Expiring reflogs and running gc ..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

Write-Host "Done. Next steps:"
Write-Host "1) Rotate compromised credentials."
Write-Host "2) Force push all branches/tags."
Write-Host "3) Instruct collaborators to re-clone."
