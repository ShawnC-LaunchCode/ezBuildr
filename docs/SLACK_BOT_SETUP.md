# Slack Bot Token Setup for CI/CD Notifications

This guide explains how to set up Slack bot token authentication for Vault-Logic's GitHub Actions CI/CD notifications.

## Why Bot Token Instead of Webhook?

Bot tokens provide more capabilities than webhooks:
- **Threading**: Post failure details as threaded replies
- **Better error handling**: Get response feedback from Slack API
- **More features**: Access to full Slack Web API
- **Scalability**: Can post to multiple channels programmatically

## Prerequisites

- Slack workspace admin access
- GitHub repository admin access
- A Slack channel for CI/CD notifications

---

## Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click **"Create New App"**
3. Select **"From scratch"**
4. Name your app: **"Vault-Logic CI/CD"**
5. Select your workspace
6. Click **"Create App"**

---

## Step 2: Add Bot Token Scopes

1. In your app settings, go to **"OAuth & Permissions"** (left sidebar)
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Add the following scopes:
   - `chat:write` - Post messages (required)
   - `chat:write.public` - Post to public channels without joining (required)
   - `reactions:write` - Add emoji reactions (optional, for ✅/❌ reactions)
   - `channels:read` - View channel info (optional, for validation)

---

## Step 3: Install App to Workspace

1. Scroll to top of **"OAuth & Permissions"** page
2. Click **"Install to Workspace"** (or **"Reinstall to Workspace"** if updating scopes)
3. Review permissions and click **"Allow"**
4. **Copy the "Bot User OAuth Token"** (starts with `xoxb-`)
   - ⚠️ **Keep this secret!** Never commit to code or share publicly

**Note:** If you add scopes after initial installation, you must **reinstall** the app for the new scopes to take effect. The token will remain the same.

---

## Step 4: Get Your Slack Channel ID

**Method 1: Via Slack UI**
1. Open your Slack channel in a browser
2. Check the URL: `https://app.slack.com/client/T0XXXXX/C0XXXXX`
3. The second ID (`C0XXXXX`) is your channel ID

**Method 2: Via API**
1. Go to https://api.slack.com/methods/conversations.list/test
2. Select your app from dropdown
3. Click **"Test Method"**
4. Find your channel in the response and copy the `id` field

---

## Step 5: Add GitHub Secrets

1. Go to your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:

   | Secret Name | Value | Example |
   |-------------|-------|---------|
   | `SLACK_BOT_TOKEN` | Your bot token from Step 3 | `xoxb-...` |
   | `SLACK_CHANNEL_ID` | Channel ID from Step 4 | `C07XXXXXXXXX` |

3. **Optional:** If you previously used webhooks, you can delete `SLACK_WEBHOOK_URL`

---

## Step 6: Invite Bot to Channel (If Private)

If your notification channel is private:

1. Go to the Slack channel
2. Type `/invite @Vault-Logic CI/CD`
3. Or click channel name → **Integrations** → **Add apps**

For public channels, this is not required (thanks to `chat:write.public` scope).

---

## Step 7: Test the Integration

**Option 1: Trigger a GitHub Actions workflow**
```bash
git commit --allow-empty -m "test: trigger CI notification"
git push origin main
```

**Option 2: Manual API test**
```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer YOUR_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "YOUR_CHANNEL_ID",
    "text": "🧪 Test notification from Vault-Logic bot token setup"
  }'
```

Expected response:
```json
{
  "ok": true,
  "channel": "C07XXXXXXXXX",
  "ts": "1234567890.123456",
  "message": { ... }
}
```

---

## Troubleshooting

### Error: `not_in_channel`

**Solution:** Invite the bot to the channel (Step 6)

### Error: `invalid_auth`

**Causes:**
- Bot token is incorrect or expired
- Token not properly set in GitHub Secrets
- Token format is wrong (should start with `xoxb-`)

**Solution:**
1. Verify token in GitHub Secrets
2. Regenerate token in Slack app settings if needed

### Error: `channel_not_found`

**Causes:**
- Channel ID is incorrect
- Bot doesn't have access to the channel

**Solution:**
1. Double-check channel ID (should start with `C`)
2. Ensure channel exists and bot is invited (if private)

### Messages not threading

**Causes:**
- Thread timestamp (`ts`) not captured from main message
- Bot token not working correctly

**Solution:**
1. Check GitHub Actions logs for the `ts` output
2. Verify bot has `chat:write` scope
3. Ensure workflow is using latest code

### Token exposed or leaked

**IMMEDIATE ACTIONS:**
1. Go to https://api.slack.com/apps → Your App → **OAuth & Permissions**
2. Click **"Revoke"** next to Bot User OAuth Token
3. Generate new token by reinstalling app
4. Update GitHub Secret with new token
5. Rotate any other credentials if shared in same context

---

## Features

### Current Features
✅ Rich CI/CD status notifications with Block Kit formatting
✅ Test results summary (Vitest + Playwright)
✅ Coverage reporting
✅ Deployment status
✅ Threaded failure details (when tests fail)
✅ Color-coded status (green for pass, red for fail)

### Bot Token Advantages Over Webhook
- ✅ Threaded replies for failure details
- ✅ Better error handling and response validation
- ✅ Can post to multiple channels programmatically
- ✅ Access to full Slack Web API features
- ✅ Rate limit information in responses

---

## Security Best Practices

1. **Never commit tokens to git**
   - Always use GitHub Secrets or environment variables
   - Add `*.env` and `*.token` to `.gitignore`

2. **Rotate tokens regularly**
   - Recommended: Every 90 days
   - After any security incident
   - When team members leave

3. **Principle of least privilege**
   - Only grant necessary scopes
   - Use separate bots for different functions
   - Review app permissions periodically

4. **Monitor bot activity**
   - Check Slack audit logs regularly
   - Review GitHub Actions logs
   - Set up alerts for unusual activity

5. **Revoke immediately if compromised**
   - Slack App Settings → OAuth & Permissions → Revoke
   - Update GitHub Secret with new token
   - Investigate how token was exposed

---

## References

- [Slack API Documentation](https://api.slack.com/docs)
- [Block Kit Builder](https://app.slack.com/block-kit-builder)
- [slackapi/slack-github-action](https://github.com/slackapi/slack-github-action)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

---

**Version:** 1.0
**Last Updated:** 2025-11-02
**Maintained by:** Vault-Logic DevOps Team
