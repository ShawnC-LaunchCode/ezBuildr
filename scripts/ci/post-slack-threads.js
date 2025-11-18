#!/usr/bin/env node
/**
 * Post Slack Thread Replies for CI/CD
 *
 * Posts threaded replies to the main Slack message with links,
 * test failures, coverage report, and artifacts.
 *
 * Usage:
 *   node post-slack-threads.js [--payload path] [--message-info path]
 *
 * Environment variables:
 *   SLACK_BOT_TOKEN: Slack bot token (required)
 */

import { WebClient } from '@slack/web-api';
import fs from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    payload: 'slack-payload.json',
    messageInfo: 'slack-message.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--payload' && i + 1 < process.argv.length) {
      args.payload = process.argv[++i];
    } else if (arg === '--message-info' && i + 1 < process.argv.length) {
      args.messageInfo = process.argv[++i];
    }
  }

  return args;
}

/**
 * Validate environment and load data
 */
function loadData(args) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error('❌ SLACK_BOT_TOKEN is required');
    process.exit(1);
  }

  if (!fs.existsSync(args.payload)) {
    console.error(`❌ Payload file not found: ${args.payload}`);
    process.exit(1);
  }

  if (!fs.existsSync(args.messageInfo)) {
    console.error(`❌ Message info file not found: ${args.messageInfo}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(args.payload, 'utf8'));
  const messageInfo = JSON.parse(fs.readFileSync(args.messageInfo, 'utf8'));

  if (!messageInfo.ts || !messageInfo.channel) {
    console.error('❌ Invalid message info: missing ts or channel');
    process.exit(1);
  }

  console.log('✓ Loaded payload and message info');
  console.log(`  Parent message: ${messageInfo.ts}`);

  return { token, payload, messageInfo };
}

/**
 * Post a threaded reply with retry logic
 */
async function postThreadReply(client, channel, threadTs, message, label, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📤 Posting ${label} (attempt ${attempt}/${maxRetries})...`);

      const response = await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        ...message,
      });

      console.log(`✅ ${label} posted`);
      return response;
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`   Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`❌ Failed to post ${label} after ${maxRetries} attempts`);
  console.error('Last error:', lastError?.message || 'Unknown error');
  return null;
}

/**
 * Post all thread replies
 */
async function postAllThreads(client, channel, threadTs, threads) {
  const results = {
    links: null,
    failures: null,
    coverage: null,
    artifacts: null,
  };

  // 1. Post links thread
  if (threads.links) {
    results.links = await postThreadReply(
      client,
      channel,
      threadTs,
      threads.links,
      'Links thread'
    );
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 2. Post failures thread (if there are failures)
  if (threads.failures && threads.failures.text.includes('Failed')) {
    results.failures = await postThreadReply(
      client,
      channel,
      threadTs,
      threads.failures,
      'Failures thread'
    );
    await new Promise(resolve => setTimeout(resolve, 500));
  } else if (threads.failures) {
    console.log('\n✓ Skipping failures thread (all tests passed)');
  }

  // 3. Post coverage thread
  if (threads.coverage) {
    results.coverage = await postThreadReply(
      client,
      channel,
      threadTs,
      threads.coverage,
      'Coverage thread'
    );
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 4. Post artifacts thread (if configured)
  if (threads.artifacts && !threads.artifacts.text.includes('not configured')) {
    results.artifacts = await postThreadReply(
      client,
      channel,
      threadTs,
      threads.artifacts,
      'Artifacts thread'
    );
  } else if (threads.artifacts) {
    console.log('\n✓ Skipping artifacts thread (not configured yet)');
  }

  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('🧵 Posting Slack thread replies...\n');

  const args = parseArgs();
  const { token, payload, messageInfo } = loadData(args);

  // Initialize Slack client
  const client = new WebClient(token);

  // Post all threads
  const results = await postAllThreads(
    client,
    messageInfo.channel,
    messageInfo.ts,
    payload.threads
  );

  // Count successes
  const successCount = Object.values(results).filter(r => r !== null).length;
  const totalCount = Object.keys(results).length;

  console.log(`\n✅ Posted ${successCount}/${totalCount} thread replies`);

  if (successCount === 0) {
    console.log('⚠️  No threads were posted successfully');
    console.log('   Exiting with success code to not fail workflow');
  } else if (successCount < totalCount) {
    console.log(`⚠️  Some threads failed to post (${totalCount - successCount} failed)`);
    console.log('   Exiting with success code to not fail workflow');
  } else {
    console.log('🎉 All thread replies posted successfully!');
  }

  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n❌ Unexpected error:', error);
    console.log('\n⚠️  Exiting with success code to not fail workflow');
    process.exit(0);
  });
}

export { postThreadReply, postAllThreads };
