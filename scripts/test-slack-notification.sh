#!/bin/bash
# Test Slack notification for ezBuildr CI/CD
# Usage: SLACK_WEBHOOK_URL="your-webhook-url" bash test-slack-notification.sh

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "❌ Error: SLACK_WEBHOOK_URL environment variable is not set"
  echo ""
  echo "Usage:"
  echo "  SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK/URL' bash test-slack-notification.sh"
  exit 1
fi

# Sample test data
BRANCH="main"
COMMIT_SHORT="3de53d1"
COMMIT_MSG="chore(ci): add rich Slack notifications for build/test/deploy events"
AUTHOR="ezBuildr DevOps"
COVERAGE="82.5%"
ENVIRONMENT="Production"
DEPLOY_URL="https://ezbuildr-production.up.railway.app"
RUN_URL="https://github.com/ShawnC-LaunchCode/ezBuildr/actions"
STATUS_ICON="✅"
STATUS_TEXT="Build Passed"
COLOR="#36A64F"

# Create test payload
cat > /tmp/slack-test-payload.json <<EOF
{
  "attachments": [
    {
      "color": "$COLOR",
      "blocks": [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "🚀 ezBuildr CI/CD Report [TEST]",
            "emoji": true
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Status:*\\n$STATUS_ICON $STATUS_TEXT"
            },
            {
              "type": "mrkdwn",
              "text": "*Environment:*\\n$ENVIRONMENT"
            },
            {
              "type": "mrkdwn",
              "text": "*Branch:*\\n\`$BRANCH\`"
            },
            {
              "type": "mrkdwn",
              "text": "*Commit:*\\n\`$COMMIT_SHORT\`"
            },
            {
              "type": "mrkdwn",
              "text": "*Author:*\\n$AUTHOR"
            },
            {
              "type": "mrkdwn",
              "text": "*Coverage:*\\n$COVERAGE"
            }
          ]
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*Commit Message:*\\n> $COMMIT_MSG"
          }
        },
        {
          "type": "divider"
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "mrkdwn",
              "text": "🧪 *Test Results Summary*"
            }
          ]
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Unit & Integration:* ✅"
            },
            {
              "type": "mrkdwn",
              "text": "*Coverage:* ✅"
            },
            {
              "type": "mrkdwn",
              "text": "*E2E (Playwright):* ✅"
            }
          ]
        },
        {
          "type": "divider"
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "🚀 *Deployed:* <$DEPLOY_URL|View Live App>\\n📊 *Workflow Details:* <$RUN_URL|View on GitHub>"
          }
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "plain_text",
              "text": "GitHub Actions • Railway CI • ezBuildr [TEST NOTIFICATION]",
              "emoji": true
            }
          ]
        }
      ]
    }
  ]
}
EOF

echo "📤 Sending test notification to Slack..."
echo ""

# Send to Slack
RESPONSE=$(curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d @/tmp/slack-test-payload.json)

if [ "$RESPONSE" == "ok" ]; then
  echo "✅ Test notification sent successfully!"
  echo ""
  echo "Check your Slack channel for the message."
  echo ""
  echo "Next steps:"
  echo "  1. Verify the notification appears in Slack"
  echo "  2. The real notifications will be triggered automatically by GitHub Actions"
  echo "  3. Every push to main/develop will send a notification"
else
  echo "❌ Failed to send notification"
  echo "Response: $RESPONSE"
  exit 1
fi

# Clean up
rm -f /tmp/slack-test-payload.json
