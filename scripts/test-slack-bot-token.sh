#!/bin/bash
# Test Slack bot token for ezBuildr CI/CD
# Usage:
#   SLACK_BOT_TOKEN="xoxb-..." SLACK_CHANNEL_ID="C0XXXXX" bash test-slack-bot-token.sh

if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo "❌ Error: SLACK_BOT_TOKEN environment variable is not set"
  echo ""
  echo "Usage:"
  echo "  SLACK_BOT_TOKEN='xoxb-your-token' SLACK_CHANNEL_ID='C0XXXXX' bash test-slack-bot-token.sh"
  echo ""
  echo "See docs/SLACK_BOT_SETUP.md for setup instructions"
  exit 1
fi

if [ -z "$SLACK_CHANNEL_ID" ]; then
  echo "❌ Error: SLACK_CHANNEL_ID environment variable is not set"
  echo ""
  echo "Usage:"
  echo "  SLACK_BOT_TOKEN='xoxb-your-token' SLACK_CHANNEL_ID='C0XXXXX' bash test-slack-bot-token.sh"
  echo ""
  echo "See docs/SLACK_BOT_SETUP.md for setup instructions"
  exit 1
fi

# Test 1: Simple message
echo "📤 Test 1: Sending simple message..."
echo ""

RESPONSE1=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$SLACK_CHANNEL_ID\",
    \"text\": \"🧪 Test notification from ezBuildr bot token setup\"
  }")

OK1=$(echo "$RESPONSE1" | jq -r '.ok')

if [ "$OK1" == "true" ]; then
  echo "✅ Simple message sent successfully!"
  MESSAGE_TS=$(echo "$RESPONSE1" | jq -r '.ts')
  echo "   Message timestamp: $MESSAGE_TS"
else
  echo "❌ Failed to send simple message"
  echo "Response: $RESPONSE1"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 2: Rich Block Kit message (like CI/CD notifications)
echo "📤 Test 2: Sending rich formatted message..."
echo ""

cat > /tmp/slack-test-payload.json <<EOF
{
  "channel": "$SLACK_CHANNEL_ID",
  "text": "🚀 ezBuildr CI/CD Test Report",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🚀 Poll-Vault CI/CD Test Report",
        "emoji": true
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Status:*\\n✅ Test Passed"
        },
        {
          "type": "mrkdwn",
          "text": "*Environment:*\\nLocal Testing"
        },
        {
          "type": "mrkdwn",
          "text": "*Branch:*\\n\`test-branch\`"
        },
        {
          "type": "mrkdwn",
          "text": "*Author:*\\nBot Token Setup"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "plain_text",
          "text": "Bot Token Test • ezBuildr",
          "emoji": true
        }
      ]
    }
  ]
}
EOF

RESPONSE2=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/slack-test-payload.json)

OK2=$(echo "$RESPONSE2" | jq -r '.ok')

if [ "$OK2" == "true" ]; then
  echo "✅ Rich message sent successfully!"
  MESSAGE_TS2=$(echo "$RESPONSE2" | jq -r '.ts')
  echo "   Message timestamp: $MESSAGE_TS2"
else
  echo "❌ Failed to send rich message"
  echo "Response: $RESPONSE2"
  rm -f /tmp/slack-test-payload.json
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 3: Threaded reply
echo "📤 Test 3: Sending threaded reply..."
echo ""

RESPONSE3=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$SLACK_CHANNEL_ID\",
    \"thread_ts\": \"$MESSAGE_TS2\",
    \"text\": \"🧵 This is a threaded reply! Bot token enables threading for failure details.\"
  }")

OK3=$(echo "$RESPONSE3" | jq -r '.ok')

if [ "$OK3" == "true" ]; then
  echo "✅ Threaded reply sent successfully!"
  echo "   Check Slack to see the thread attached to the rich message"
else
  echo "❌ Failed to send threaded reply"
  echo "Response: $RESPONSE3"
  rm -f /tmp/slack-test-payload.json
  exit 1
fi

# Clean up
rm -f /tmp/slack-test-payload.json

echo ""
echo "---"
echo ""
echo "🎉 All tests passed!"
echo ""
echo "✅ Bot token authentication working"
echo "✅ Can post to channel"
echo "✅ Rich formatting working"
echo "✅ Threading working"
echo ""
echo "Next steps:"
echo "  1. Verify all 3 messages appear in your Slack channel"
echo "  2. Verify the third message is threaded under the second"
echo "  3. Add SLACK_BOT_TOKEN and SLACK_CHANNEL_ID to GitHub Secrets"
echo "  4. Push to main/develop to trigger real CI/CD notifications"
echo ""
echo "See docs/SLACK_BOT_SETUP.md for GitHub setup instructions"
