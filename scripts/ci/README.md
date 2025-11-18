# CI/CD Scripts

This directory contains scripts used by GitHub Actions workflows for test result parsing, coverage analysis, and Slack notifications.

## Scripts Overview

### `parse-test-results.js`

Parses Vitest and Playwright test results into a unified JSON format.

**Usage:**
```bash
node scripts/ci/parse-test-results.js \
  --vitest-json vitest-summary.json \
  --playwright-json playwright-summary.json \
  --output test-results-parsed.json
```

**Output format:**
```json
{
  "vitest": {
    "total": 142,
    "passed": 140,
    "failed": 2,
    "skipped": 0,
    "duration": 12500,
    "failures": [
      {
        "suite": "workflow-engine › conditional-routing",
        "test": "should route correctly",
        "error": "Expected true, got false",
        "location": "tests/unit/engine.test.ts:142"
      }
    ]
  },
  "playwright": {
    "total": 24,
    "passed": 24,
    "failed": 0,
    "skipped": 0,
    "flaky": 0,
    "duration": 45000,
    "didNotRun": false,
    "failures": []
  },
  "summary": {
    "total": 166,
    "passed": 164,
    "failed": 2,
    "skipped": 0,
    "duration": 57500,
    "status": "failure"
  }
}
```

**Status values:**
- `success` - All tests passed
- `failure` - One or more tests failed
- `warning` - Tests did not run (e.g., webserver failed to start)

### `parse-coverage.js`

Parses Vitest coverage data and extracts metrics.

**Usage:**
```bash
node scripts/ci/parse-coverage.js \
  --coverage-json coverage/coverage-summary.json \
  --output coverage-parsed.json
```

**Output format:**
```json
{
  "statements": {
    "total": 332,
    "covered": 289,
    "pct": 87.05
  },
  "branches": {
    "total": 114,
    "covered": 91,
    "pct": 79.82
  },
  "functions": {
    "total": 63,
    "covered": 57,
    "pct": 90.48
  },
  "lines": {
    "total": 303,
    "covered": 271,
    "pct": 89.44
  },
  "summary": {
    "pct": 87.05,
    "color": "green",
    "emoji": "🟢"
  },
  "topFiles": {
    "best": [
      { "file": "server/services/WorkflowService.ts", "pct": 100 },
      { "file": "server/services/SectionService.ts", "pct": 98.5 }
    ],
    "worst": [
      { "file": "server/routes/admin.ts", "pct": 12.3 },
      { "file": "server/utils/legacy.ts", "pct": 5.8 }
    ]
  }
}
```

**Coverage colors:**
- 🟢 `green` - 80%+ coverage
- 🟡 `yellow` - 50-79% coverage
- 🔴 `red` - <50% coverage

### `get-file-changes.js`

Extracts file change statistics from Git and computes "heat" level based on change volume.

**Usage:**
```bash
node scripts/ci/get-file-changes.js --output file-changes.json
```

**Required environment variables:**
- `GITHUB_SHA` - Commit SHA
- `GITHUB_REPOSITORY` - owner/repo
- `GITHUB_ACTOR` - Actor username
- `GITHUB_EVENT_NAME` - Event type (push, pull_request, etc.)
- `GITHUB_EVENT_PATH` - Path to event JSON (for PR info)
- `GITHUB_BASE_REF` - Base branch (for PRs)
- `GITHUB_HEAD_REF` - Head branch (for PRs)

**Output format:**
```json
{
  "filesChanged": 34,
  "additions": 245,
  "deletions": 89,
  "heat": {
    "level": "medium",
    "emoji": "🔥",
    "label": "Medium change"
  },
  "files": [
    {
      "path": "server/routes/workflows.ts",
      "additions": 45,
      "deletions": 12,
      "status": "modified"
    }
  ],
  "pr": {
    "number": 123,
    "title": "Add new feature",
    "url": "https://github.com/owner/repo/pull/123",
    "author": "username",
    "draft": false,
    "labels": ["enhancement"]
  },
  "commit": {
    "sha": "8af32d1",
    "fullSha": "8af32d1...",
    "message": "Fix DataVault row updates",
    "author": "John Doe",
    "actor": "johndoe"
  },
  "compareUrl": "https://github.com/owner/repo/compare/main...8af32d1"
}
```

**Heat levels:**
- 🧊 `low` - <20 files changed (Small change)
- 🔥 `medium` - 20-99 files changed (Medium change)
- 🔥🔥 `high` - 100+ files changed (Mega-change)

### `build-slack-payload.js`

Generates comprehensive Slack notification payloads using BlockKit, including main message and threaded replies.

**Usage:**
```bash
node scripts/ci/build-slack-payload.js \
  --test-results test-results-parsed.json \
  --coverage coverage-parsed.json \
  --file-changes file-changes.json \
  --coverage-delta coverage-delta.json \
  --output slack-payload.json
```

**Required environment variables:**
- `GITHUB_RUN_NUMBER` - Build/run number
- `GITHUB_REF_NAME` - Branch name
- `GITHUB_SHA` - Commit SHA
- `GITHUB_ACTOR` - Actor username
- `GITHUB_REPOSITORY` - owner/repo
- `GITHUB_RUN_ID` - Run ID
- `GITHUB_SERVER_URL` - GitHub server URL
- `GITHUB_EVENT_NAME` - Event type

**Output format:**
```json
{
  "main": {
    "text": "🚀 Build #142 — main — 🟢 SUCCESS",
    "blocks": [ /* BlockKit blocks */ ],
    "attachments": [{ "color": "#10B981" }],
    "unfurl_links": false,
    "unfurl_media": false
  },
  "threads": {
    "links": {
      "text": "🔗 *Links*\n• <url|View Run>\n...",
      "unfurl_links": false
    },
    "failures": {
      "text": "❌ *3 Test(s) Failed*\n..."
    },
    "coverage": {
      "text": "📊 *Coverage Report*\n..."
    },
    "artifacts": {
      "text": "📦 *Artifacts*\n..."
    }
  }
}
```

**Main message features:**
- Compact format (5-8 lines)
- No URLs in main message (only in threads)
- Status emoji (🟢/🔴/🟡)
- Test results summary
- Coverage percentage with delta
- File change heat indicator
- Duration and trigger type
- Color-coded attachment

**Thread messages:**
1. **Links**: All URLs (run, logs, compare, PR) with unfurl disabled
2. **Failures**: Detailed test failure information (up to 10 failures)
3. **Coverage**: Breakdown by metric + top/bottom files
4. **Artifacts**: Build artifacts and deployment info (placeholder)

### `post-slack-main.js`

Posts the main Slack notification message and saves message info for threading.

**Usage:**
```bash
node scripts/ci/post-slack-main.js \
  --payload slack-payload.json \
  --output slack-message.json
```

**Required environment variables:**
- `SLACK_BOT_TOKEN` - Slack bot token (required)
- `SLACK_CHANNEL_ID` - Slack channel ID (required)
- `SLACK_MENTION_GROUP` - Subteam ID to mention on failure (optional)

**Features:**
- Posts main message using Slack Web API
- Automatic retry with exponential backoff (3 attempts: 2s, 4s, 8s)
- Adds reaction emoji based on status (✅/❌/⚠️)
- Mentions team on failure (if configured)
- Saves message timestamp for threading
- Graceful error handling (never fails workflow)

**Output format:**
```json
{
  "ts": "1234567890.123456",
  "channel": "C1234567890",
  "permalink": "https://..."
}
```

### `post-slack-threads.js`

Posts threaded replies to the main message with detailed information.

**Usage:**
```bash
node scripts/ci/post-slack-threads.js \
  --payload slack-payload.json \
  --message-info slack-message.json
```

**Required environment variables:**
- `SLACK_BOT_TOKEN` - Slack bot token (required)

**Features:**
- Posts up to 4 threaded replies: links, failures, coverage, artifacts
- Automatic retry with exponential backoff per thread
- Rate limiting protection (500ms delay between threads)
- Skips threads that are not applicable (e.g., no failures, no artifacts)
- Graceful error handling (partial success is OK)

**Thread posting order:**
1. Links (always)
2. Failures (if tests failed)
3. Coverage (if available)
4. Artifacts (if configured)

### `compute-coverage-delta.js`

Compares current coverage with previous run and computes the delta.

**Usage:**
```bash
node scripts/ci/compute-coverage-delta.js \
  --current coverage-parsed.json \
  --previous coverage-previous.json \
  --output coverage-delta.json
```

**Features:**
- Compares current vs previous coverage percentages
- Computes delta (positive or negative)
- Determines if coverage improved or regressed
- Saves current coverage for next run
- Handles missing previous data gracefully

**Output format:**
```json
{
  "current": 87.05,
  "previous": 85.23,
  "delta": 1.82,
  "improved": true,
  "emoji": "📈",
  "message": "Coverage improved by 1.82%"
}
```

**Emoji indicators:**
- 📈 Coverage improved (delta > 0)
- 📉 Coverage decreased (delta < 0)
- ➡️ Coverage unchanged (delta = 0)

**Note**: Requires downloading previous coverage artifact from prior run. See GitHub Actions integration below.

## Integration with GitHub Actions

These scripts are designed to be called from GitHub Actions workflows:

```yaml
# 1. Download previous coverage artifact (if available)
- name: Download previous coverage
  uses: actions/download-artifact@v4
  continue-on-error: true
  with:
    name: coverage-for-next-run
    path: ./

# 2. Parse test results
- name: Parse test results
  run: |
    node scripts/ci/parse-test-results.js \
      --vitest-json vitest-summary.json \
      --playwright-json playwright-summary.json \
      --output test-results-parsed.json

# 3. Parse coverage
- name: Parse coverage
  run: |
    node scripts/ci/parse-coverage.js \
      --coverage-json coverage/coverage-summary.json \
      --output coverage-parsed.json

# 4. Compute coverage delta
- name: Compute coverage delta
  run: |
    node scripts/ci/compute-coverage-delta.js \
      --current coverage-parsed.json \
      --previous coverage-for-next-run.json \
      --output coverage-delta.json

# 5. Upload coverage for next run
- name: Upload coverage artifact
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: coverage-for-next-run
    path: coverage-for-next-run.json
    retention-days: 30

# 6. Get file changes
- name: Get file changes
  run: |
    node scripts/ci/get-file-changes.js \
      --output file-changes.json

# 7. Build Slack payload
- name: Build Slack payload
  run: |
    node scripts/ci/build-slack-payload.js \
      --test-results test-results-parsed.json \
      --coverage coverage-parsed.json \
      --file-changes file-changes.json \
      --coverage-delta coverage-delta.json \
      --output slack-payload.json

# 8. Post Slack main message
- name: Post Slack main message
  run: |
    node scripts/ci/post-slack-main.js \
      --payload slack-payload.json \
      --output slack-message.json
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
    SLACK_CHANNEL_ID: ${{ secrets.SLACK_CHANNEL_ID }}

# 9. Post Slack threads
- name: Post Slack threads
  run: |
    node scripts/ci/post-slack-threads.js \
      --payload slack-payload.json \
      --message-info slack-message.json
  env:
    SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

The output JSON files can then be used by subsequent steps (e.g., Slack notifications).

## Error Handling

All scripts:
- Exit with code 0 even on test failures (so notifications still run)
- Output detailed console logs for debugging
- Handle missing input files gracefully
- Generate empty/default output when data is unavailable

## Testing Locally

You can test these scripts locally after running tests:

```bash
# Run tests with coverage
npm run test:coverage -- --reporter=json --outputFile=vitest-summary.json

# Parse results
node scripts/ci/parse-test-results.js
node scripts/ci/parse-coverage.js
node scripts/ci/get-file-changes.js

# Build Slack payload
node scripts/ci/build-slack-payload.js

# Check output
cat test-results-parsed.json
cat coverage-parsed.json
cat file-changes.json
cat slack-payload.json
```
