# 🌐 Open Moona App in Chrome

## ✅ Backend is Running!

Your backend server is active and ready. Here's how to access it:

## 📍 URLs to Open in Chrome

**Copy and paste these URLs directly into Chrome's address bar:**

### 1. Backend API Endpoint
```
http://localhost:8000/api/
```
You should see: `{"message":"Hello World"}`

### 2. API Documentation (Interactive)
```
http://localhost:8000/docs
```
This opens the Swagger UI where you can test all API endpoints!

### 3. Alternative API Docs
```
http://localhost:8000/redoc
```
ReDoc format of the API documentation.

## 🚀 Quick Access

1. **Open Chrome**
2. **Click the address bar** (or press `Cmd+L`)
3. **Type**: `localhost:8000`
4. **Press Enter**

Or copy-paste: `http://localhost:8000/docs`

## 🎯 Frontend (After Installing Node.js)

Once you install Node.js and start the frontend:

```
http://localhost:3000
```

## 🔍 Troubleshooting

### If URLs don't work:

1. **Check if backend is running:**
   ```bash
   curl http://localhost:8000/api/
   ```
   Should return: `{"message":"Hello World"}`

2. **Restart backend if needed:**
   ```bash
   cd /Users/sathishkumar/Downloads/Moona-main/backend
   python3 -m uvicorn server:app --reload --port 8000
   ```

3. **Check firewall settings** - Make sure localhost connections are allowed

4. **Try 127.0.0.1 instead of localhost:**
   ```
   http://127.0.0.1:8000/docs
   ```

## 📱 Current Status

- ✅ Backend: Running on port 8000
- ⏳ Frontend: Waiting for Node.js installation

---

**Just copy `http://localhost:8000/docs` into Chrome's address bar!** 🎉

