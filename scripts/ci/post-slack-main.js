#!/usr/bin/env node
/**
 * Post Slack Main Message for CI/CD
 *
 * Posts the main Slack notification message and saves the message
 * timestamp for threaded replies.
 *
 * Usage:
 *   node post-slack-main.js [--payload path] [--output path]
 *
 * Environment variables:
 *   SLACK_BOT_TOKEN: Slack bot token (required)
 *   SLACK_CHANNEL_ID: Slack channel ID (required)
 *   SLACK_MENTION_GROUP: Group to mention on failure (optional)
 *
 * Output format:
 * {
 *   "ts": "1234567890.123456",
 *   "channel": "C1234567890",
 *   "permalink": "https://..."
 * }
 */

import { WebClient } from '@slack/web-api';
import fs from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    payload: 'slack-payload.json',
    output: 'slack-message.json',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--payload' && i + 1 < process.argv.length) {
      args.payload = process.argv[++i];
    } else if (arg === '--output' && i + 1 < process.argv.length) {
      args.output = process.argv[++i];
    }
  }

  return args;
}

/**
 * Validate environment variables
 */
function validateEnv() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    console.error('❌ Missing required Slack credentials\n');
    console.error('SLACK_BOT_TOKEN:', token ? '✓ Set' : '✗ Missing');
    console.error('SLACK_CHANNEL_ID:', channel ? '✓ Set' : '✗ Missing');
    console.error('\nPlease configure these secrets in your GitHub repository settings.');
    process.exit(1);
  }

  console.log('✓ Slack credentials validated');
  return { token, channel };
}

/**
 * Load payload from file
 */
function loadPayload(path) {
  if (!fs.existsSync(path)) {
    console.error(`❌ Payload file not found: ${path}`);
    process.exit(1);
  }

  try {
    const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!payload.main) {
      console.error('❌ Invalid payload: missing "main" property');
      process.exit(1);
    }
    console.log('✓ Loaded Slack payload');
    return payload;
  } catch (error) {
    console.error(`❌ Error loading payload: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Add mention to message if build failed
 */
function addMentionIfNeeded(message) {
  const mentionGroup = process.env.SLACK_MENTION_GROUP;
  if (!mentionGroup) {
    return message;
  }

  // Check if this is a failure message
  const isFailed = message.text && (message.text.includes('FAILED') || message.text.includes('🔴'));

  if (!isFailed) {
    return message;
  }

  // Add mention to the beginning of the text
  const mentionText = `<!subteam^${mentionGroup}> `;

  return {
    ...message,
    text: mentionText + message.text,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: mentionText,
        },
      },
      ...message.blocks,
    ],
  };
}

/**
 * Post main message to Slack with retry logic
 */
async function postMainMessage(client, channel, message, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📤 Posting main message to Slack (attempt ${attempt}/${maxRetries})...`);

      const response = await client.chat.postMessage({
        channel,
        ...message,
      });

      console.log('✅ Main message posted successfully');
      console.log(`   Timestamp: ${response.ts}`);
      console.log(`   Channel: ${response.channel}`);

      // Get permalink
      let permalink = null;
      try {
        const permalinkResponse = await client.chat.getPermalink({
          channel: response.channel,
          message_ts: response.ts,
        });
        permalink = permalinkResponse.permalink;
        console.log(`   Permalink: ${permalink}`);
      } catch (error) {
        console.log('   ⚠️  Could not fetch permalink (non-critical)');
      }

      return {
        ts: response.ts,
        channel: response.channel,
        permalink,
      };
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`   Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  console.error(`\n❌ Failed to post message after ${maxRetries} attempts`);
  console.error('Last error:', lastError?.message || 'Unknown error');
  if (lastError?.data) {
    console.error('Error details:', JSON.stringify(lastError.data, null, 2));
  }

  // Don't fail the workflow, just log the error
  console.log('\n⚠️  Continuing workflow despite Slack notification failure');
  return null;
}

/**
 * Add reaction to message
 */
async function addReaction(client, channel, timestamp, reactionName) {
  try {
    console.log(`\n📌 Adding reaction: :${reactionName}:`);
    await client.reactions.add({
      name: reactionName,
      channel,
      timestamp,
    });
    console.log('✅ Reaction added');
  } catch (error) {
    console.log('⚠️  Could not add reaction (missing reactions:write scope or already reacted)');
    console.log('   This is non-critical - continuing...');
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Posting Slack main message...\n');

  const args = parseArgs();
  const { token, channel } = validateEnv();
  const payload = loadPayload(args.payload);

  // Initialize Slack client
  const client = new WebClient(token);

  // Add mention if needed (on failure)
  const message = addMentionIfNeeded(payload.main);

  // Post main message with retry logic
  const result = await postMainMessage(client, channel, message);

  if (!result) {
    // Failed to post, but we don't want to fail the workflow
    console.log('\n⚠️  Exiting with success code despite Slack failure');
    process.exit(0);
  }

  // Determine reaction based on message status
  let reactionName = 'white_check_mark';
  if (message.text.includes('FAILED') || message.text.includes('🔴')) {
    reactionName = 'x';
  } else if (message.text.includes('WARNING') || message.text.includes('🟡')) {
    reactionName = 'warning';
  }

  // Add reaction (optional, non-critical)
  await addReaction(client, result.channel, result.ts, reactionName);

  // Save result for threading
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
  console.log(`\n✅ Message info saved to ${args.output}`);
  console.log(`\n🎉 Slack notification complete!`);
  console.log(`   View in Slack: ${result.permalink || `https://slack.com/app_redirect?channel=${result.channel}`}`);

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

export { postMainMessage, addReaction, addMentionIfNeeded };
