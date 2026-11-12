# 🔍 Debugging Google OAuth "authentication failed" Error

## ✅ Good News
- Database tables exist ✅
- Database connection works ✅
- Backend is running ✅

## 🔍 The Issue
The error "Google authentication failed" is happening during the OAuth flow.

## Common Causes

### 1. Redirect URI Mismatch (Most Common)
**Problem:** The redirect URI in Google Cloud Console doesn't match what the backend sends.

**Check:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your OAuth 2.0 Client ID: `687644263156-ogrv9joos1118leid0asb2clkedmiuja.apps.googleusercontent.com`
3. Click to edit it
4. Check "Authorized redirect URIs"
5. **Must include exactly:** `http://localhost:3000/login`
   - No trailing slash
   - Exact match (case-sensitive)
   - Must be `http://localhost:3000/login` (not `/callback` or anything else)

**Fix:**
- Add `http://localhost:3000/login` to Authorized redirect URIs
- Save changes
- Wait 1-2 minutes for changes to propagate

### 2. Expired/Invalid OAuth Code
**Problem:** The authorization code from Google has expired or was already used.

**Fix:**
- Click "Continue with Gmail" button again to get a fresh code
- Don't refresh the page during OAuth flow

### 3. Google Token Exchange Error
**Problem:** Google rejects the token exchange request.

**Check backend logs:**
```bash
tail -50 /tmp/backend.log | grep -i "google\|oauth\|error"
```

Look for messages like:
- `invalid_grant`
- `redirect_uri_mismatch`
- `invalid_client`

## How to Get Detailed Error

### Method 1: Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Try Gmail login
4. Look for error messages (usually red)
5. Share the exact error

### Method 2: Network Tab
1. Open DevTools (F12)
2. Go to Network tab
3. Try Gmail login
4. Find request to `/api/auth/google/callback`
5. Click it → Check "Response" tab
6. Share the error message

### Method 3: Backend Logs
```bash
tail -100 /tmp/backend.log | grep -A 5 -B 5 "error\|exception\|failed"
```

## Quick Test

Test if redirect URI is correct:
1. Go to: http://localhost:3000/login
2. Click "Continue with Gmail"
3. You should be redirected to Google
4. After authorizing, you should come back to `/login?code=...`
5. If you get an error immediately, it's likely redirect_uri mismatch

## Most Likely Fix

**Add this to Google Cloud Console:**
```
http://localhost:3000/login
```

In: Google Cloud Console → APIs & Services → Credentials → Your OAuth Client → Authorized redirect URIs

Then try again!

