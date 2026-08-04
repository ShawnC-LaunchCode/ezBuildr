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
    - Nothing defines TEST_DATABASE_URL, and tests/setup.ts falls back to port
      5432 while the Docker test container publishes 5434 — so integration and
      unit-db suites in a fresh worktree target a port with nothing on it.

  WHY node_modules IS NOW COPIED, NOT JUNCTIONED (changed 2026-08-02)
  ------------------------------------------------------------------
  A junction shares ONE physical node_modules between the main checkout and
  every worktree. Several build caches live inside it and are keyed to a single
  project root, so sharing them corrupts results across checkouts:

    - node_modules/.vite — Vite's dep-optimizer cache. With three concurrent
      worktrees this produced bare-specifier misresolution, e.g. the built-in
      `stream` module resolving to "<worktree>\stream". All three DataVault
      Phase 1 devs hit it, and each invented a DIFFERENT undisclosed workaround
      (one replaced the junction with a real install, two built temporary
      shims). The result: not one of their reported gate runs was reproducible,
      and the reviewer had to re-run every gate by hand in the main checkout.
      Note this passed at worktree-creation time and only broke later, once a
      second root rewrote the shared cache — so the creation-time proof below
      could not have caught it.
    - node_modules/typescript/tsbuildinfo — already known to give worktrees
      both stale errors AND stale greens.

  Copying costs ~1GB of disk and ~30-90s per worktree. That is much cheaper
  than an unreproducible gate report, which is what the junction was actually
  buying. Use -LinkModules to opt back into a junction for a worktree that only
  needs tsc/ESLint and will never run Vitest.

  WHY EACH WORKTREE GETS ITS OWN TEST DATABASE
  --------------------------------------------
  tests/setup.ts creates one Postgres schema per WORKER, not per process, so
  two concurrent DB-backed runs — including across worktrees — clobber each
  other's schemas and fake dozens of failures. Pointing every worktree at the
  shared `ezbuildr_test` guarantees that collision the moment two devs run
  integration suites. Each worktree therefore gets its own database on the same
  server, created here if it does not exist.

  This script does all of it correctly and then PROVES it, so a dispatched dev
  never inherits a silently broken tree.

.EXAMPLE
  pwsh scripts/new-worktree.ps1 -Name iex-5

.EXAMPLE
  # tsc/ESLint only, no Vitest — shares main's node_modules, much faster.
  pwsh scripts/new-worktree.ps1 -Name iex-5 -LinkModules

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

  # Share main's node_modules via a junction instead of copying it. Faster and
  # smaller, but shares Vite/tsc caches — do NOT use for a worktree that will
  # run Vitest. See the .DESCRIPTION note.
  [switch]$LinkModules,

  # Tear the worktree down safely (drops a junction before deleting).
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$repoRoot = (git rev-parse --show-toplevel).Trim() -replace '/', '\'
$worktreeDir = Join-Path $repoRoot ".claude\worktrees\$Name"

# Postgres identifiers: keep this in sync with the DB name written into .env.
$dbSuffix = ($Name -replace '[^A-Za-z0-9]', '_').ToLower()
$testDbName = "ezbuildr_test_$dbSuffix"

<#
  Teardown.

  `git worktree remove --force` recurses INTO a node_modules junction and
  deletes the main checkout's node_modules along with the worktree. That is not
  hypothetical: it wiped all 1018 packages in this repo and required a full
  `npm ci` to recover. A junction has to be dropped as a reparse point first —
  DirectoryInfo.Delete() removes the link without touching its target. A COPIED
  node_modules has no reparse point and is simply deleted.
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
      Write-Host "==> Deleting this worktree's own node_modules (may take a moment)" -ForegroundColor Cyan
      Remove-Item $nm -Recurse -Force
    }
  }

  <#
    `git worktree remove` writes its failures to stderr and still exits
    non-zero, but PowerShell's $ErrorActionPreference does not apply to native
    commands — so the previous version of this script printed "Removed
    worktree" on a FAILED removal. Observed for real: git deregistered the
    worktree and emptied it, then hit "Permission denied" on the now-empty
    directory (Windows holds a transient handle after a Vitest run), leaving a
    stale folder that blocks the next create with the same name.
  #>
  git -C $repoRoot worktree remove --force $worktreeDir 2>&1 | Write-Host
  $removeFailed = ($LASTEXITCODE -ne 0)
  $global:LASTEXITCODE = 0

  if ($removeFailed -or (Test-Path $worktreeDir)) {
    Write-Host "==> Removal incomplete — pruning metadata and retrying the directory" -ForegroundColor Yellow
    git -C $repoRoot worktree prune | Out-Null
    $global:LASTEXITCODE = 0
    for ($i = 1; $i -le 5 -and (Test-Path $worktreeDir); $i++) {
      Start-Sleep -Milliseconds 500
      try { Remove-Item $worktreeDir -Recurse -Force -ErrorAction Stop } catch { }
    }
  }

  # Verify the removal actually happened, in both git's view and on disk.
  if (Test-Path $worktreeDir) {
    throw "$worktreeDir still exists. Something holds a handle on it — close any editor/test process in that directory and re-run."
  }
  if ((git -C $repoRoot worktree list) -match [regex]::Escape($worktreeDir)) {
    throw "git still lists $worktreeDir as a worktree. Run 'git worktree prune' and investigate."
  }
  Write-Host "Removed worktree $worktreeDir" -ForegroundColor Green

  if (-not (Test-Path (Join-Path $repoRoot 'node_modules\typescript'))) {
    throw "MAIN node_modules looks damaged — run 'npm ci' in $repoRoot."
  }
  Write-Host "  [ok] main node_modules intact"

  if ((git -C $repoRoot branch --list $Name)) {
    Write-Host "  [note] branch '$Name' still exists; delete it with: git branch -D $Name" -ForegroundColor DarkGray
  }

  Write-Host "  [note] test database '$testDbName' was left in place; drop it with:" -ForegroundColor DarkGray
  Write-Host "         docker exec <pg-container> psql -U postgres -c 'DROP DATABASE $testDbName'" -ForegroundColor DarkGray
  return
}

if (Test-Path $worktreeDir) {
  throw "Worktree already exists at $worktreeDir. Remove it with 'pwsh scripts/new-worktree.ps1 -Name $Name -Remove' first."
}

Write-Host "==> Fetching and creating worktree from $BaseBranch" -ForegroundColor Cyan
git -C $repoRoot fetch origin --quiet
git -C $repoRoot worktree add -b $Name $worktreeDir $BaseBranch | Out-Null

# --- node_modules ----------------------------------------------------------
$target = Join-Path $repoRoot 'node_modules'
if (-not (Test-Path $target)) {
  throw "$target does not exist. Run 'npm install' in the main checkout first."
}
$worktreeModules = Join-Path $worktreeDir 'node_modules'

if ($LinkModules) {
  Write-Host "==> Linking node_modules (junction, -LinkModules)" -ForegroundColor Yellow
  Write-Host "    Vite/tsc caches are SHARED with main. Do not run Vitest here." -ForegroundColor Yellow
  New-Item -ItemType Junction -Path $worktreeModules -Target $target | Out-Null
} else {
  Write-Host "==> Copying node_modules (own Vite/tsc caches; ~30-90s)" -ForegroundColor Cyan
  # /MIR mirrors, /MT parallelises, the /N* flags silence per-file logging.
  # .vite and tsbuildinfo are excluded so the new tree starts with cold caches
  # rather than inheriting ones keyed to the main checkout's root.
  robocopy $target $worktreeModules /MIR /MT:16 /NFL /NDL /NJH /NJS /NP `
    /XD (Join-Path $target '.vite') `
    /XF 'tsbuildinfo' | Out-Null
  # robocopy: 0-7 are success, 8+ are real failures.
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE — node_modules was not copied."
  }
  $global:LASTEXITCODE = 0
}

# --- .env ------------------------------------------------------------------
$envDest = Join-Path $worktreeDir '.env'
$envSrc = Join-Path $repoRoot '.env'
if (Test-Path $envSrc) {
  Copy-Item $envSrc $envDest
  Write-Host "==> Copied .env" -ForegroundColor Cyan
} else {
  Write-Warning ".env not found in the main checkout — ~27 suites will fail on 'DATABASE_URL: Required'."
}

<#
  TEST_DATABASE_URL.

  tests/setup.ts deliberately ignores the inherited DATABASE_URL (which may
  point at a shared cloud DB) and resolves the test database from
  TEST_DATABASE_URL — falling back to port 5432 when it is unset. But the
  Docker test container publishes 5434, and nothing in .env or .env.example
  defines the variable, so every integration / unit-db run in a fresh worktree
  hits the wrong port until someone exports it by hand.

  The DATABASE NAME is per-worktree (see .DESCRIPTION): schemas are per-worker,
  so a shared database means concurrent worktrees clobber each other.
#>
$testDbPort = '5434'
$composeFile = Join-Path $repoRoot 'docker-compose.test.yml'
if (Test-Path $composeFile) {
  $portMatch = [regex]::Match((Get-Content $composeFile -Raw), '"(\d+):5432"')
  if ($portMatch.Success) { $testDbPort = $portMatch.Groups[1].Value }
}

# Create the per-worktree database. Best-effort: a worktree for a unit-only
# ticket is still usable without it, so warn rather than throw.
$dbCreated = $false
$pgContainer = $null
try {
  $pgContainer = (docker ps --filter "publish=$testDbPort" --format '{{.Names}}' 2>$null | Select-Object -First 1)
} catch {
  $pgContainer = $null
}
if ($pgContainer) {
  # `CREATE DATABASE` has no IF NOT EXISTS; an existing database is fine, so
  # swallow that one error and let anything else surface in the warning.
  $createOut = (docker exec $pgContainer psql -U postgres -c "CREATE DATABASE $testDbName" 2>&1 | Out-String)
  $global:LASTEXITCODE = 0
  if ($createOut -match 'CREATE DATABASE' -or $createOut -match 'already exists') {
    $dbCreated = $true
    Write-Host "==> Test database '$testDbName' ready (container $pgContainer)" -ForegroundColor Cyan
  } else {
    Write-Host "  [warn] could not create '$testDbName': $($createOut.Trim())" -ForegroundColor Yellow
  }
} else {
  Write-Host "  [warn] no container publishing port $testDbPort — cannot create '$testDbName'." -ForegroundColor Yellow
  Write-Host "         Start it with: npm run test:docker:up, then create the DB by hand." -ForegroundColor Yellow
}

$testDbUrl = "postgresql://postgres:postgres@localhost:$testDbPort/$testDbName"
$existingEnv = if (Test-Path $envDest) { Get-Content $envDest -Raw } else { '' }
if ($existingEnv -match '(?m)^\s*TEST_DATABASE_URL\s*=') {
  # main's .env has no TEST_DATABASE_URL today, but if that changes the copy
  # would carry the SHARED database name in — which is the collision this is
  # meant to prevent. Rewrite it rather than leaving it.
  $rewritten = $existingEnv -replace '(?m)^\s*TEST_DATABASE_URL\s*=.*$', "TEST_DATABASE_URL=$testDbUrl"
  Set-Content -Path $envDest -Value $rewritten -NoNewline
  Write-Host "==> Rewrote inherited TEST_DATABASE_URL to this worktree's database" -ForegroundColor Cyan
} else {
  $block = @"

# Added by scripts/new-worktree.ps1. Two things matter here:
#   - tests/setup.ts falls back to port 5432, but docker-compose.test.yml
#     publishes $testDbPort. Without this, DB suites target the wrong port.
#   - The database name is PER-WORKTREE. tests/setup.ts creates schemas per
#     worker, not per process, so worktrees sharing one database clobber each
#     other's schemas and produce dozens of fake failures.
TEST_DATABASE_URL=$testDbUrl
"@
  Add-Content -Path $envDest -Value $block
  Write-Host "==> Set TEST_DATABASE_URL (port $testDbPort, db $testDbName)" -ForegroundColor Cyan
}

# --- Prove it, rather than assuming ----------------------------------------
Write-Host "`n==> Verifying" -ForegroundColor Cyan

$link = Get-Item $worktreeModules -Force
if ($LinkModules) {
  if ($link.LinkType -ne 'Junction') {
    throw "node_modules is a $($link.LinkType), not a Junction. Vitest will fail to find its runner."
  }
  Write-Host "  [ok] node_modules is a Junction (-LinkModules)"
} else {
  if ($null -ne $link.LinkType) {
    throw "node_modules is a $($link.LinkType); it must be a real directory so Vite/tsc caches are not shared."
  }
  Write-Host "  [ok] node_modules is a real directory (caches not shared)"
}

foreach ($probe in @('@types', 'typescript', 'vitest')) {
  if (-not (Test-Path (Join-Path $worktreeModules $probe))) {
    throw "node_modules/$probe is missing — the dependency tree is incomplete."
  }
}
Write-Host "  [ok] @types, typescript and vitest all resolve"

$base = (git -C $worktreeDir rev-parse HEAD).Trim()
$tip  = (git -C $repoRoot rev-parse $BaseBranch).Trim()
if ($base -ne $tip) {
  throw "Worktree base $base does not match $BaseBranch tip $tip."
}
Write-Host "  [ok] base commit matches $BaseBranch ($($base.Substring(0,8)))"

$dbUp = Test-NetConnection -ComputerName 'localhost' -Port $testDbPort -InformationLevel Quiet -WarningAction SilentlyContinue
if ($dbUp -and $dbCreated) {
  Write-Host "  [ok] test database '$testDbName' reachable on port $testDbPort"
} elseif ($dbUp) {
  Write-Host "  [warn] port $testDbPort is up but '$testDbName' was not created — DB suites will fail." -ForegroundColor Yellow
} else {
  Write-Host "  [warn] nothing listening on port $testDbPort — unit-db and integration" -ForegroundColor Yellow
  Write-Host "         suites will fail. Start it with: npm run test:docker:up" -ForegroundColor Yellow
}

if ($SkipVerify) {
  Write-Host "`n  [skipped] test-suite proof (-SkipVerify)" -ForegroundColor Yellow
} else {
  Write-Host "  ... running test:fast to prove the suite executes (~60s)"
  Push-Location $worktreeDir
  try {
    $output = & npm run test:fast 2>&1 | Out-String
  } finally {
    Pop-Location
  }

  $cleanOutput = $output -replace '\x1b\[[0-9;]*[a-zA-Z]', ''

  # "0 test" / "no tests" means the runner is broken, which is NOT the same as
  # a failing test — and it is the failure that has actually bitten us.
  if ($cleanOutput -notmatch 'Tests\s+\d+\s+passed') {
    Write-Host $output
    throw "test:fast did not report any passing tests. The tree is broken — do not dispatch anyone into it."
  }
  $matched = [regex]::Match($cleanOutput, 'Tests\s+(\d+)\s+passed')
  Write-Host "  [ok] test suite runs ($($matched.Groups[1].Value) tests passed)"

  # A bare-specifier misresolution (e.g. `stream` -> "<worktree>\stream") is the
  # shared-cache symptom this script now prevents; fail loudly if it reappears.
  if ($cleanOutput -match 'Failed to resolve|Cannot find module ''(stream|path|fs|util)''') {
    Write-Host $output
    throw "Bare Node builtin failed to resolve — the dependency tree is misconfigured. Do not dispatch into this worktree."
  }
}

Write-Host "`nWorktree ready: $worktreeDir" -ForegroundColor Green
Write-Host "  test DB: $testDbName (isolated from other worktrees)" -ForegroundColor DarkGray
Write-Host "Dispatch with the path above. When done, tear it down with:"
Write-Host "  pwsh scripts/new-worktree.ps1 -Name $Name -Remove" -ForegroundColor DarkGray
if ($LinkModules) {
  Write-Host "NOT 'git worktree remove' — that recurses into the node_modules" -ForegroundColor DarkYellow
  Write-Host "junction and deletes the main checkout's packages with it." -ForegroundColor DarkYellow
}
