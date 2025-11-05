# OAuth 2.0 Login 401 Error Troubleshooting Guide

## Overview
This guide helps diagnose and fix 401 Unauthorized errors when using Google OAuth2 login in Vault-Logic.

## Recent Changes (2025-10-13)
- Enhanced error logging in backend (`server/googleAuth.ts`)
- Improved error handling in frontend (`client/src/components/GoogleLogin.tsx`)
- Added detailed error categorization and user-friendly messages
- Added debug logging for token verification process

## Common Causes of 401 Errors

### 1. Google Client ID Misconfiguration
**Symptoms:**
- Error message: "Token audience mismatch"
- Console shows `audience` mismatch error

**Causes:**
- `GOOGLE_CLIENT_ID` (server) doesn't match `VITE_GOOGLE_CLIENT_ID` (client)
- OAuth2 Client ID not configured in Google Cloud Console
- Using wrong client ID for the environment (dev vs production)

**Fix:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Verify your OAuth 2.0 Client ID
3. Ensure both `.env` variables match:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```
4. Restart the development server: `npm run dev`

### 2. Authorized Origins Not Configured
**Symptoms:**
- Login popup works but token verification fails
- Error: "Invalid request origin" (403 error, not 401)

**Causes:**
- Authorized JavaScript origins not set in Google Cloud Console
- CORS configuration blocking the request

**Fix:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Add authorized JavaScript origins:
   - Development: `http://localhost:5000`
   - Development: `http://127.0.0.1:5000`
   - Production: Your production domain (e.g., `https://yourdomain.com`)
4. Add authorized redirect URIs (same as origins)
5. Save changes (may take a few minutes to propagate)

### 3. Token Verification Failure
**Symptoms:**
- Error message: "Invalid Google token"
- Console shows token verification error

**Causes:**
- Token expired before reaching the server
- Token was issued for a different client ID
- Network latency causing token expiration
- Clock skew between client and server

**Fix:**
1. Check server logs for detailed error messages
2. Verify system clock is accurate
3. Try signing in again (token may have expired)
4. Check network connectivity

### 4. Email Not Verified
**Symptoms:**
- Error: "Email not verified by Google" (403 error, not 401)

**Causes:**
- Google account email not verified

**Fix:**
1. Check your Google account email verification status
2. Verify your email through Google
3. Try signing in again

### 5. Environment Variables Not Loaded
**Symptoms:**
- Error: "Environment variable GOOGLE_CLIENT_ID not provided"
- Server fails to start

**Causes:**
- `.env` file not present
- `.env` file not loaded correctly
- Environment variables not exported

**Fix:**
1. Ensure `.env` file exists in project root
2. Copy from template: `cp .env.example .env`
3. Fill in your Google Client ID values
4. Restart the server

## Debugging Steps

### Step 1: Check Server Logs
The enhanced logging now provides detailed information:

```bash
# Start the server and watch for errors
npm run dev
```

Look for these log entries:
- `OAuth2 login attempt:` - Shows incoming request details
- `Verifying Google token:` - Shows token verification process
- `Token payload received:` - Shows decoded token information
- `Google token verification failed:` - Shows specific error details

### Step 2: Check Browser Console
Open browser DevTools (F12) and look for:
- `Received Google credential, sending to backend...` - Confirms token received from Google
- `Backend authentication successful` - Confirms server accepted the login
- `Google login error:` - Shows client-side errors
- `Detailed error:` - Shows parsed error response from server

### Step 3: Verify Google Cloud Console Configuration

1. **Check OAuth 2.0 Client ID exists:**
   - Go to APIs & Services > Credentials
   - Verify you have a "Web application" OAuth 2.0 client

2. **Check Authorized JavaScript origins:**
   ```
   http://localhost:5000
   http://127.0.0.1:5000
   ```

3. **Check Authorized redirect URIs:**
   ```
   http://localhost:5000
   http://127.0.0.1:5000
   ```

### Step 4: Test with Development Login (Bypass OAuth)
If you need to bypass OAuth temporarily:

```bash
# Enable development mode in server/routes/auth.routes.ts
# This route is only available in NODE_ENV=development

# Visit or POST to:
curl -X POST http://localhost:5000/api/auth/dev-login
```

### Step 5: Check CORS Configuration
Verify CORS is properly configured in `server/index.ts`:

```javascript
// Development should allow localhost
if (process.env.NODE_ENV === 'development') {
  // localhost, 127.0.0.1, and 0.0.0.0 should be allowed
}
```

## Error Message Reference

### Backend Error Messages (with error codes)

| Error Code | Message | Status | Cause | Fix |
|------------|---------|--------|-------|-----|
| `missing_token` | ID token is required | 400 | No token in request | Check frontend sends idToken |
| `invalid_origin` | Invalid request origin | 403 | CORS/Origin mismatch | Configure ALLOWED_ORIGIN |
| `token_expired` | Google token has expired | 401 | Token age exceeded | User needs to sign in again |
| `invalid_token_signature` | Invalid Google token | 401 | Bad signature | Check client ID configuration |
| `malformed_token` | Malformed Google token | 401 | JWT format error | Check token generation |
| `audience_mismatch` | Token audience mismatch | 500 | Client ID mismatch | Fix GOOGLE_CLIENT_ID |
| `invalid_issuer` | Token issuer invalid | 401 | Not from Google | Verify token source |
| `email_not_verified` | Email not verified | 403 | Google email unverified | Verify Google account |

## Testing the Fix

After making changes:

1. **Restart the server:**
   ```bash
   # Kill existing server
   # Windows: Ctrl+C or taskkill
   # Start fresh
   npm run dev
   ```

2. **Clear browser storage:**
   - Open DevTools (F12)
   - Application tab > Storage > Clear site data
   - Refresh the page

3. **Try logging in:**
   - Click "Sign in with Google"
   - Watch both server logs and browser console
   - Note any error messages

4. **Check the detailed error response:**
   - In development mode, errors include detailed information
   - Error object contains `message`, `error` code, and `details`

## Common Configuration Issues

### Issue: "CORS error" in browser
**Solution:**
1. Check `ALLOWED_ORIGIN` in `.env` includes your domain
2. Verify `server/index.ts` CORS configuration
3. In development, localhost should be automatically allowed

### Issue: Session not persisting
**Solution:**
1. Check database connection (`DATABASE_URL`)
2. Verify `sessions` table exists (run `npm run db:push`)
3. Check cookie settings in browser (should allow cookies from localhost)

### Issue: Multiple Google Client IDs
**Solution:**
If you have separate client IDs for development and production:
1. Use `.env` for development
2. Use `.env.production` or environment variables for production
3. Ensure the frontend and backend use the same client ID in each environment

## Need More Help?

1. **Check server logs** - Most errors are logged with detailed context
2. **Check browser console** - Frontend errors show detailed error responses
3. **Enable verbose logging** - Already enabled in recent changes
4. **Check Google Cloud Console** - Verify OAuth configuration
5. **Try development login** - Bypass OAuth to test other functionality

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Identity Setup Guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [CORS Configuration Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Vault-Logic Documentation](../CLAUDE.md)
