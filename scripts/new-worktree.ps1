<#
.SYNOPSIS
  Create a dev worktree that can actually build and test.

.DESCRIPTION
  A git worktree starts with no node_modules and no .env, and every manual fix
  for that has failed in a way that looks fine:

    - `cmd //c mklink` from Git Bash produces a doubled drive letter
      (C:\C:\Users\...) resolving to an empty directory. Gates then run against
      nothing and report GREEN.
    - `ln -s` from Git Bash produces a POSIX symlink, not a junction. tsc and
      ESLint work, so it looks healthy, but every Vitest project fails to run
      with "Vitest failed to find the runner". An agent turned in two
      submissions from a worktree in that state, having never run a test.
    - A worktree is not guaranteed to branch from current main; agents have
      been dispatched onto bases two weeks stale.

  This script does all of it correctly and then PROVES it, so a dispatched dev
  never inherits a silently broken tree.

.EXAMPLE
  pwsh scripts/new-worktree.ps1 -Name iex-5

.EXAMPLE
  # ALWAYS remove worktrees this way, never with a bare `git worktree remove`.
  pwsh scripts/new-worktree.ps1 -Name iex-5 -Remove
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  # Branch to base the worktree on.
  [string]$BaseBranch = 'main',

  # Skip the test-suite proof (fast, but you are then trusting the tree).
  [switch]$SkipVerify,

  # Tear the worktree down safely (drops the junction before deleting).
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel).Trim() -replace '/', '\'
$worktreeDir = Join-Path $repoRoot ".claude\worktrees\$Name"

<#
  Teardown.

  `git worktree remove --force` recurses INTO the node_modules junction and
  deletes the main checkout's node_modules along with the worktree. That is not
  hypothetical: it wiped all 1018 packages in this repo and required a full
  `npm ci` to recover. The junction has to be dropped as a reparse point first —
  DirectoryInfo.Delete() removes the link without touching its target.
#>
if ($Remove) {
  if (-not (Test-Path $worktreeDir)) {
    throw "No worktree at $worktreeDir"
  }

  $nm = Join-Path $worktreeDir 'node_modules'
  if (Test-Path $nm) {
    $item = Get-Item $nm -Force
    if ($item.LinkType -eq 'Junction') {
      $item.Delete()
      Write-Host "==> Dropped node_modules junction (target untouched)" -ForegroundColor Cyan
    } else {
      Remove-Item $nm -Recurse -Force
      Write-Host "==> Removed node_modules (was $($item.LinkType), not a junction)" -ForegroundColor Yellow
    }
  }

  git -C $repoRoot worktree remove --force $worktreeDir
  Write-Host "Removed worktree $worktreeDir" -ForegroundColor Green

  if (-not (Test-Path (Join-Path $repoRoot 'node_modules\typescript'))) {
    throw "MAIN node_modules looks damaged — run 'npm ci' in $repoRoot."
  }
  Write-Host "  [ok] main node_modules intact"
  return
}

if (Test-Path $worktreeDir) {
  throw "Worktree already exists at $worktreeDir. Remove it with 'git worktree remove' first."
}

Write-Host "==> Fetching and creating worktree from $BaseBranch" -ForegroundColor Cyan
git -C $repoRoot fetch origin --quiet
git -C $repoRoot worktree add -b $Name $worktreeDir $BaseBranch | Out-Null

# --- node_modules: a real Windows junction, never a symlink -----------------
Write-Host "==> Linking node_modules (junction)" -ForegroundColor Cyan
$target = Join-Path $repoRoot 'node_modules'
if (-not (Test-Path $target)) {
  throw "$target does not exist. Run 'npm install' in the main checkout first."
}
New-Item -ItemType Junction -Path (Join-Path $worktreeDir 'node_modules') -Target $target | Out-Null

# --- .env ------------------------------------------------------------------
$envSrc = Join-Path $repoRoot '.env'
if (Test-Path $envSrc) {
  Copy-Item $envSrc (Join-Path $worktreeDir '.env')
  Write-Host "==> Copied .env" -ForegroundColor Cyan
} else {
  Write-Warning ".env not found in the main checkout — ~27 suites will fail on 'DATABASE_URL: Required'."
}

# --- Prove it, rather than assuming ----------------------------------------
Write-Host "`n==> Verifying" -ForegroundColor Cyan

$link = Get-Item (Join-Path $worktreeDir 'node_modules')
if ($link.LinkType -ne 'Junction') {
  throw "node_modules is a $($link.LinkType), not a Junction. Vitest will fail to find its runner."
}
Write-Host "  [ok] node_modules is a Junction"

if (-not (Test-Path (Join-Path $worktreeDir 'node_modules\@types'))) {
  throw "node_modules/@types is missing — the link did not resolve. tsc would run against nothing."
}
Write-Host "  [ok] node_modules/@types resolves"

$base = (git -C $worktreeDir rev-parse HEAD).Trim()
$tip  = (git -C $repoRoot rev-parse $BaseBranch).Trim()
if ($base -ne $tip) {
  throw "Worktree base $base does not match $BaseBranch tip $tip."
}
Write-Host "  [ok] base commit matches $BaseBranch ($($base.Substring(0,8)))"

if ($SkipVerify) {
  Write-Host "`n  [skipped] test-suite proof (-SkipVerify)" -ForegroundColor Yellow
} else {
  Write-Host "  ... running test:fast to prove the suite executes (~30s)"
  Push-Location $worktreeDir
  try {
    $output = & npm run test:fast 2>&1 | Out-String
  } finally {
    Pop-Location
  }

  # "0 test" / "no tests" means the runner is broken, which is NOT the same as
  # a failing test — and it is the failure that has actually bitten us.
  if ($output -notmatch 'Tests\s+\d+\s+passed') {
    Write-Host $output
    throw "test:fast did not report any passing tests. The tree is broken — do not dispatch anyone into it."
  }
  $matched = [regex]::Match($output, 'Tests\s+(\d+)\s+passed')
  Write-Host "  [ok] test suite runs ($($matched.Groups[1].Value) tests passed)"
}

Write-Host "`nWorktree ready: $worktreeDir" -ForegroundColor Green
Write-Host "Dispatch with the path above. When done, tear it down with:"
Write-Host "  pwsh scripts/new-worktree.ps1 -Name $Name -Remove" -ForegroundColor DarkGray
Write-Host "NOT 'git worktree remove' — that recurses into the node_modules" -ForegroundColor DarkYellow
Write-Host "junction and deletes the main checkout's packages with it." -ForegroundColor DarkYellow
