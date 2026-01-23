#!/bin/bash
# Simple Slack webhook test
# Usage: SLACK_WEBHOOK_URL="your-url" bash test-simple-slack.sh

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "❌ SLACK_WEBHOOK_URL not set"
  echo ""
  echo "To test your Slack webhook:"
  echo "  SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK/URL' bash test-simple-slack.sh"
  exit 1
fi

curl -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"text":"🧪 Test notification from ezBuildr CI setup"}'

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Webhook request sent! Check your Slack channel."
else
  echo ""
  echo "❌ Failed to send webhook request"
  exit 1
fi
