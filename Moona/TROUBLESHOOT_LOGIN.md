# 🔧 Troubleshooting Gmail Login

## Current Status
- ✅ Database tables exist
- ✅ Database connection works
- ✅ Backend is running
- ⚠️ Gmail login still failing

## Step-by-Step Debugging

### Step 1: Check Browser Console
1. Open your app: http://localhost:3000/login
2. Open DevTools (F12)
3. Go to **Console** tab
4. Click "Continue with Gmail"
5. **Watch for these logs:**
   - `🔵 Starting Google OAuth login...`
   - `🔵 Redirecting to Google OAuth...`
   - `🔵 Google OAuth Callback: ...`
   - `🔵 Backend response status: ...`
   - Any red error messages

### Step 2: Check Network Tab
1. In DevTools, go to **Network** tab
2. Click "Continue with Gmail"
3. Look for these requests:
   - Redirect to `accounts.google.com` (should happen)
   - Return to `/login?code=...&state=...` (should happen)
   - Request to `/api/auth/google/callback?code=...` (this is the important one)
4. Click on the `/api/auth/google/callback` request
5. Check:
   - **Status**: Should be 200 (not 401, 500, etc.)
   - **Response**: What does it say?

### Step 3: Check What Happens
**Scenario A: You get redirected to Google**
- ✅ OAuth flow started correctly
- After authorizing, you should come back to `/login?code=...`
- If you see an error after coming back, check the `/api/auth/google/callback` response

**Scenario B: You don't get redirected to Google**
- ❌ OAuth button might not be working
- Check console for JavaScript errors
- Check if `REACT_APP_GOOGLE_CLIENT_ID` is set

**Scenario C: Google shows an error**
- Check the error message Google shows
- Common: "redirect_uri_mismatch" - means redirect URI not configured in Google Console

### Step 4: Verify Google Cloud Console
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find OAuth Client: `687644263156-ogrv9joos1118leid0asb2clkedmiuja`
3. Check **Authorized redirect URIs**:
   - Must include: `http://localhost:3000/login`
   - Exact match, no trailing slash
4. If missing, add it and **Save**
5. Wait 1-2 minutes for changes to propagate

### Step 5: Check Backend Logs
```bash
tail -100 /tmp/backend.log | grep -i "google\|oauth\|error\|exception"
```

Look for:
- `Google OAuth token exchange failed`
- `Database table error`
- `redirect_uri_mismatch`
- Any exception tracebacks

## Common Errors & Fixes

### Error: "redirect_uri_mismatch"
**Fix:** Add `http://localhost:3000/login` to Google Cloud Console → OAuth Client → Authorized redirect URIs

### Error: "invalid_grant" or "Authorization code expired"
**Fix:** Click Gmail button again to get a fresh code. Don't refresh during OAuth flow.

### Error: "Database tables not found"
**Fix:** Run SQL migration in Supabase (should already be done, but verify with `python3 backend/test_db_connection.py`)

### Error: "Google authentication failed" (generic)
**Check:**
1. Backend logs for specific error
2. Browser console for detailed error
3. Network tab for response details

## Quick Test Commands

```bash
# Check if tables exist
cd backend
python3 test_db_connection.py

# Check backend logs
tail -50 /tmp/backend.log | grep -i error

# Test backend endpoint
curl http://localhost:8000/api/auth/me
```

## Share This Information

When asking for help, share:
1. **Exact error message** from browser console
2. **Network tab response** from `/api/auth/google/callback`
3. **Backend log errors** (from `tail -100 /tmp/backend.log`)
4. **What happens** when you click Gmail button:
   - Do you get redirected to Google?
   - What URL do you come back to?
   - What error appears?

This will help identify the exact issue!

