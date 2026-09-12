#!/usr/bin/env node
/**
 * Post a Slack alert when a gate job fails on a push.
 *
 * WHY THIS EXISTS. ci.yml's Tests job posts to Slack on every run, so a red
 * build gets noticed within hours. rls-gate.yml posted nothing, and the RLS
 * enforcement gate sat red for 35 consecutive pushes (2026-08-28 -> 09-06) and
 * then for 23 more (09-07 -> 09-11) with nobody forced to look. `dev` has no
 * required checks and pushes to it use the owner bypass, so making the gate
 * required there would change nothing; an alert is what reaches a human.
 * See RLS-11 AC 4 in tickets/ENVIRONMENTS_AND_RLS_TICKETS.md.
 *
 * Usage:
 *   node scripts/ci/post-slack-gate-failure.js --gate "RLS Enforcement Gate" \
 *     [--details <captured gate output>] [--dry-run]
 *
 * Environment variables:
 *   SLACK_BOT_TOKEN, SLACK_CHANNEL_ID  required unless --dry-run
 *   GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_REF_NAME,
 *   GITHUB_SHA                         set by GitHub Actions; used for the link
 */

import fs from 'fs';

import { WebClient } from '@slack/web-api';

const MAX_LINES = 20;
const MAX_CHARS = 2800; // a Slack section block holds 3000

function parseArgs(argv) {
  const args = { gate: 'Gate', details: undefined, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--gate' && i + 1 < argv.length) {
      args.gate = argv[++i];
    } else if (arg === '--details' && i + 1 < argv.length) {
      args.details = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

/**
 * The verdict, not the whole log. The RLS gate's captured output is mostly
 * vitest noise; its own summary ("RLS gate: N failing file(s)..." and the file
 * list after it) comes LAST — the first "RLS gate:" line is the start banner,
 * so take the last one. Other gates mark failure with "❌". Failing both, the
 * tail of the log is still better than nothing.
 */
function extractVerdict(text) {
  const lines = text
    .split(/\r?\n/)
    // eslint-disable-next-line no-control-regex
    .map(line => line.replace(/\[[0-9;]*m/g, ''))
    .filter(line => line.trim() !== '');

  let start = lines.findLastIndex(line => /RLS gate:/.test(line) && !/running the integration suite/.test(line));
  if (start === -1) {
    start = lines.findIndex(line => line.includes('❌'));
  }
  const picked = start === -1 ? lines.slice(-15) : lines.slice(start);

  if (picked.length <= MAX_LINES) {
    return picked;
  }
  return [...picked.slice(0, MAX_LINES), `… ${picked.length - MAX_LINES} more lines in the run log`];
}

function buildMessage(gate, verdictLines) {
  const {
    GITHUB_SERVER_URL = 'https://github.com',
    GITHUB_REPOSITORY = '',
    GITHUB_RUN_ID = '',
    GITHUB_REF_NAME = 'unknown branch',
    GITHUB_SHA = '',
  } = process.env;

  const runUrl = GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : undefined;
  const commit = GITHUB_SHA ? ` @ \`${GITHUB_SHA.slice(0, 8)}\`` : '';
  const text = `:red_circle: ${gate} failed on \`${GITHUB_REF_NAME}\`${commit}`;
  const verdict = verdictLines.join('\n').slice(0, MAX_CHARS);

  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: runUrl ? `${text}\n<${runUrl}|Open the run>` : text } },
      { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${verdict}\`\`\`` } },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: 'Required on `main`: a promotion PR cannot merge while this is red. Fix the cause — never allowlist just to go green.',
        }],
      },
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const verdictLines = args.details && fs.existsSync(args.details)
    ? extractVerdict(fs.readFileSync(args.details, 'utf8'))
    : ['(no gate output was captured — see the run log)'];
  const message = buildMessage(args.gate, verdictLines);

  if (args.dryRun) {
    console.log(JSON.stringify(message, null, 2));
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    console.error('❌ SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not set — the gate failure was NOT announced.');
    process.exit(1);
  }

  const result = await new WebClient(token).chat.postMessage({ channel, ...message });
  if (!result.ok) {
    throw new Error(`Slack rejected the alert: ${result.error}`);
  }
  console.log(`✅ Gate failure posted to Slack (ts ${result.ts})`);
}

main().catch((error) => {
  console.error('❌ Could not post the gate alert:', error instanceof Error ? error.message : error);
  process.exit(1);
});
