# 🔐 Google OAuth Setup Guide

To enable Google login in your Moona app, follow these steps:

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
     - Your production domain (e.g., `https://yourdomain.com`)
   - Add authorized redirect URIs:
     - `http://localhost:3000/login` (for development)
     - `https://yourdomain.com/login` (for production)
   - Click "Create"
   - **Copy both the Client ID and Client Secret** (you'll need both)

## Step 2: Configure Environment Variables

### Backend (.env)
Add to `backend/.env`:
```env
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
Add to `frontend/.env`:
```env
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
```

## Step 3: Restart Servers

After adding the environment variables:
1. Restart the backend server
2. Restart the frontend server (or it will auto-reload)

## Step 4: Test

1. Go to the login page
2. Click "Continue with Google"
3. Sign in with your Google account
4. You should be redirected to the dashboard

## Troubleshooting

### "Google OAuth not configured" error
- Make sure `GOOGLE_CLIENT_ID` is set in `backend/.env`
- Make sure `REACT_APP_GOOGLE_CLIENT_ID` is set in `frontend/.env`
- Restart both servers after adding the variables

### CORS errors
- Make sure your authorized JavaScript origins include your frontend URL
- Check that redirect URIs match exactly

### Invalid client ID
- Verify the Client ID is correct
- Make sure you're using the Web application client ID, not iOS/Android

---

**Note**: For production, make sure to:
- Use HTTPS
- Update authorized origins and redirect URIs
- Keep your Client ID secure (it's safe to expose in frontend, but don't commit secrets)

