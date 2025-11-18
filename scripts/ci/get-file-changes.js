#!/usr/bin/env node
/**
 * File Change Stats Script for CI/CD
 *
 * Extracts file change statistics from Git and GitHub API,
 * computes "heat" level based on change volume, and outputs
 * structured JSON for use in Slack notifications.
 *
 * Usage:
 *   node get-file-changes.js [--output path]
 *
 * Environment variables:
 *   GITHUB_TOKEN: GitHub API token (optional, for PR data)
 *   GITHUB_REPOSITORY: owner/repo
 *   GITHUB_SHA: Commit SHA
 *   GITHUB_BASE_REF: Base branch (for PR)
 *   GITHUB_HEAD_REF: Head branch (for PR)
 *   GITHUB_EVENT_NAME: push, pull_request, etc.
 *   GITHUB_EVENT_PATH: Path to event JSON
 *
 * Output format:
 * {
 *   "filesChanged": 34,
 *   "additions": 245,
 *   "deletions": 89,
 *   "heat": {
 *     "level": "medium",
 *     "emoji": "🔥",
 *     "label": "Medium change"
 *   },
 *   "files": [
 *     { "path": "server/routes/workflows.ts", "additions": 45, "deletions": 12, "status": "modified" }
 *   ],
 *   "pr": {
 *     "number": 123,
 *     "title": "Add new feature",
 *     "url": "https://github.com/owner/repo/pull/123"
 *   }
 * }
 */

import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    output: 'file-changes.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Determine heat level based on number of files changed
 */
function getHeatLevel(filesChanged) {
  if (filesChanged < 20) {
    return {
      level: 'low',
      emoji: '🧊',
      label: 'Small change',
    };
  } else if (filesChanged < 100) {
    return {
      level: 'medium',
      emoji: '🔥',
      label: 'Medium change',
    };
  } else {
    return {
      level: 'high',
      emoji: '🔥🔥',
      label: 'Mega-change',
    };
  }
}

/**
 * Execute git command and return output
 */
function gitCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get file changes from Git
 */
function getGitFileChanges() {
  console.log('📂 Fetching file changes from Git...');

  const eventName = process.env.GITHUB_EVENT_NAME || 'unknown';
  const baseRef = process.env.GITHUB_BASE_REF;
  const headRef = process.env.GITHUB_HEAD_REF;
  const sha = process.env.GITHUB_SHA;

  let compareTarget = null;

  // For pull requests, compare against base branch
  if (eventName === 'pull_request' && baseRef) {
    compareTarget = `origin/${baseRef}`;
    console.log(`  Comparing against base: ${compareTarget}`);
  }
  // For pushes, compare against previous commit
  else if (sha) {
    compareTarget = `${sha}^`;
    console.log(`  Comparing against previous commit: ${compareTarget}`);
  }
  // Fallback: compare against HEAD^
  else {
    compareTarget = 'HEAD^';
    console.log(`  Comparing against: ${compareTarget}`);
  }

  // Get file stats using git diff
  const diffStats = gitCommand(`git diff --numstat ${compareTarget} HEAD`);
  if (!diffStats) {
    console.log('  ⚠️  No git diff available (single commit or initial commit)');
    return {
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      files: [],
    };
  }

  const files = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  // Parse git diff --numstat output
  // Format: <additions>\t<deletions>\t<filename>
  const lines = diffStats.split('\n').filter(line => line.trim());
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;

    const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
    const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
    const path = parts[2];

    // Determine file status
    let status = 'modified';
    if (additions > 0 && deletions === 0) {
      status = 'added';
    } else if (additions === 0 && deletions > 0) {
      status = 'deleted';
    }

    files.push({ path, additions, deletions, status });
    totalAdditions += additions;
    totalDeletions += deletions;
  }

  console.log(`  ✓ Found ${files.length} changed files`);
  console.log(`    +${totalAdditions} -${totalDeletions}`);

  return {
    filesChanged: files.length,
    additions: totalAdditions,
    deletions: totalDeletions,
    files,
  };
}

/**
 * Get PR information from GitHub event
 */
function getPRInfo() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName !== 'pull_request' || !eventPath || !fs.existsSync(eventPath)) {
    return null;
  }

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const pr = event.pull_request;

    if (!pr) return null;

    console.log(`✓ PR detected: #${pr.number} - ${pr.title}`);

    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user?.login || 'unknown',
      draft: pr.draft || false,
      mergeable: pr.mergeable,
      labels: (pr.labels || []).map(l => l.name),
    };
  } catch (error) {
    console.log(`⚠️  Error reading PR info: ${error.message}`);
    return null;
  }
}

/**
 * Get commit information
 */
function getCommitInfo() {
  const sha = process.env.GITHUB_SHA;
  const actor = process.env.GITHUB_ACTOR;

  if (!sha) return null;

  // Get commit message
  const message = gitCommand(`git log -1 --format=%s ${sha}`) || 'Unknown commit';
  const author = gitCommand(`git log -1 --format=%an ${sha}`) || actor || 'Unknown';

  console.log(`✓ Commit: ${sha.substring(0, 7)} - ${message}`);

  return {
    sha: sha.substring(0, 7),
    fullSha: sha,
    message,
    author,
    actor: actor || author,
  };
}

/**
 * Build compare URL
 */
function getCompareUrl(baseRef) {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';

  if (!repo || !sha || !baseRef) return null;

  return `${serverUrl}/${repo}/compare/${baseRef}...${sha}`;
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Analyzing file changes...\n');

  const args = parseArgs();

  // Get file changes
  const changes = getGitFileChanges();

  // Get PR info
  const pr = getPRInfo();

  // Get commit info
  const commit = getCommitInfo();

  // Compute heat level
  const heat = getHeatLevel(changes.filesChanged);
  console.log(`\n🌡️  Heat level: ${heat.emoji} ${heat.label} (${changes.filesChanged} files)`);

  // Build result
  const result = {
    filesChanged: changes.filesChanged,
    additions: changes.additions,
    deletions: changes.deletions,
    heat,
    files: changes.files,
    pr: pr || null,
    commit: commit || null,
    compareUrl: getCompareUrl(process.env.GITHUB_BASE_REF),
  };

  // Write output
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
  console.log(`\n✅ File changes analyzed successfully`);
  console.log(`   Output: ${args.output}`);

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getHeatLevel, getGitFileChanges, getPRInfo, getCommitInfo };
