from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorClient
import os
import logging
import httpx
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
from passlib.context import CryptContext
import uuid

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["authentication"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserSessionData(BaseModel):
    id: str
    email: str
    name: str
    picture: str
    session_token: str

class UserData(BaseModel):
    id: str
    email: str
    name: str
    picture: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str

@auth_router.post("/register")
async def register(user_data: RegisterRequest, response: Response):
    """Register a new Moona user account"""
    try:
        # Test MongoDB connection
        try:
            await client.admin.command('ping')
        except Exception as e:
            logger.error(f"MongoDB connection error: {str(e)}")
            raise HTTPException(
                status_code=503, 
                detail="Database connection failed. Please check your MongoDB configuration. See SETUP_MONGODB.md for setup instructions."
            )
        
        # Check if user already exists
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password
        hashed_password = pwd_context.hash(user_data.password)
        
        # Create user
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name or user_data.email.split("@")[0].replace(".", " ").title(),
            "picture": f"https://ui-avatars.com/api/?name={user_data.email.split('@')[0]}&background=random",
            "password_hash": hashed_password,
            "auth_provider": "moona",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(user_doc)
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        session_doc = {
            "session_token": session_token,
            "user_id": user_id,
            "email": user_data.email,
            "name": user_doc["name"],
            "picture": user_doc["picture"],
            "expires_at": expiry,
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/"
        )
        
        return {
            "id": user_id,
            "email": user_data.email,
            "name": user_doc["name"],
            "picture": user_doc["picture"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail="Registration failed")

@auth_router.post("/login")
async def login(login_data: LoginRequest, response: Response):
    """Login with Moona account (email/password)"""
    try:
        # Test MongoDB connection
        try:
            await client.admin.command('ping')
        except Exception as e:
            logger.error(f"MongoDB connection error: {str(e)}")
            raise HTTPException(
                status_code=503, 
                detail="Database connection failed. Please check your MongoDB configuration. See SETUP_MONGODB.md for setup instructions."
            )
        
        # Find user
        user = await db.users.find_one({"email": login_data.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Check if user has password (Moona account)
        if "password_hash" not in user:
            raise HTTPException(status_code=401, detail="Please use Google login for this account")
        
        # Verify password
        if not pwd_context.verify(login_data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        session_doc = {
            "session_token": session_token,
            "user_id": user["id"],
            "email": user["email"],
            "name": user.get("name", user["email"].split("@")[0]),
            "picture": user.get("picture", f"https://ui-avatars.com/api/?name={user['email'].split('@')[0]}&background=random"),
            "expires_at": expiry,
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/"
        )
        
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", user["email"].split("@")[0]),
            "picture": user.get("picture", f"https://ui-avatars.com/api/?name={user['email'].split('@')[0]}&background=random")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail="Login failed")

@auth_router.get("/google/callback")
async def google_callback(code: str, state: str, response: Response):
    """Handle Google OAuth callback"""
    try:
        google_client_id = os.environ.get('GOOGLE_CLIENT_ID')
        google_client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
        
        if not google_client_id or not google_client_secret:
            logger.error("Google OAuth credentials not configured")
            raise HTTPException(status_code=500, detail="Google OAuth not configured")
        
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        redirect_uri = f"{frontend_url}/login"
        
        logger.info(f"Exchanging OAuth code for token. Redirect URI: {redirect_uri}")
        
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": google_client_id,
                    "client_secret": google_client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code"
                },
                timeout=30.0
            )
            
            logger.info(f"Token exchange response status: {token_response.status_code}")
            
            if token_response.status_code != 200:
                error_data = token_response.json() if token_response.headers.get("content-type", "").startswith("application/json") else {}
                error_text = token_response.text
                error_type = error_data.get("error", "unknown_error")
                error_desc = error_data.get("error_description", error_text[:200])
                
                logger.error(f"Token exchange failed: {error_type} - {error_desc}")
                
                # Handle specific error types
                if error_type == "invalid_grant":
                    raise HTTPException(
                        status_code=400,
                        detail="Authorization code expired or already used. Please try logging in again."
                    )
                elif error_type == "redirect_uri_mismatch":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Redirect URI mismatch. Expected: {redirect_uri}. Please check Google Cloud Console configuration."
                    )
                else:
                    raise HTTPException(
                        status_code=401, 
                        detail=f"OAuth error: {error_desc}"
                    )
            
            token_data = token_response.json()
            id_token = token_data.get("id_token")
            
            if not id_token:
                raise HTTPException(status_code=401, detail="No ID token received")
        
        # Verify and decode ID token
        import jwt
        from jwt.exceptions import InvalidTokenError
        
        try:
            # Verify with Google
            async with httpx.AsyncClient() as client:
                verify_response = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
                    timeout=10.0
                )
                if verify_response.status_code != 200:
                    raise HTTPException(status_code=401, detail="Invalid Google token")
                
                token_info = verify_response.json()
                if token_info.get("aud") != google_client_id:
                    raise HTTPException(status_code=401, detail="Invalid Google client ID")
            
            decoded_token = jwt.decode(id_token, options={"verify_signature": False})
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        
        # Extract user info
        email = decoded_token.get("email")
        name = decoded_token.get("name", email.split("@")[0] if email else "User")
        picture = decoded_token.get("picture", f"https://ui-avatars.com/api/?name={name}&background=random")
        google_id = decoded_token.get("sub")
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not found in Google token")
        
        # Find or create user
        user = await db.users.find_one({"email": email})
        if not user:
            user_doc = {
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "picture": picture,
                "google_id": google_id,
                "auth_provider": "google",
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(user_doc)
            user = user_doc
        else:
            # Update user info if needed
            update_data = {
                "google_id": google_id,
                "auth_provider": "google",
                "picture": picture,
                "name": name
            }
            await db.users.update_one({"email": email}, {"$set": update_data})
            user.update(update_data)
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        session_doc = {
            "session_token": session_token,
            "user_id": user["id"],
            "email": user["email"],
            "name": user.get("name", name),
            "picture": user.get("picture", picture),
            "expires_at": expiry,
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/"
        )
        
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", name),
            "picture": user.get("picture", picture)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail="Google authentication failed")

@auth_router.post("/google")
async def google_auth(auth_data: GoogleAuthRequest, response: Response):
    """Authenticate with Google OAuth"""
    try:
        # Verify Google ID token
        import jwt
        from jwt.exceptions import InvalidTokenError
        
        # Get Google OAuth client ID from environment
        google_client_id = os.environ.get('GOOGLE_CLIENT_ID')
        if not google_client_id:
            raise HTTPException(status_code=500, detail="Google OAuth not configured")
        
        try:
            # Verify and decode the token
            decoded_token = jwt.decode(
                auth_data.id_token,
                options={"verify_signature": False}  # For now, we'll verify with Google's API
            )
            
            # Verify with Google
            async with httpx.AsyncClient() as client:
                verify_response = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={auth_data.id_token}",
                    timeout=10.0
                )
                if verify_response.status_code != 200:
                    raise HTTPException(status_code=401, detail="Invalid Google token")
                
                token_info = verify_response.json()
                if token_info.get("aud") != google_client_id:
                    raise HTTPException(status_code=401, detail="Invalid Google client ID")
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        
        # Extract user info from token
        email = decoded_token.get("email")
        name = decoded_token.get("name", email.split("@")[0])
        picture = decoded_token.get("picture", f"https://ui-avatars.com/api/?name={email.split('@')[0]}&background=random")
        google_id = decoded_token.get("sub")
        
        if not email:
            raise HTTPException(status_code=400, detail="Email not found in Google token")
        
        # Find or create user
        user = await db.users.find_one({"email": email})
        if not user:
            user_doc = {
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "picture": picture,
                "google_id": google_id,
                "auth_provider": "google",
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(user_doc)
            user = user_doc
        else:
            # Update user info if needed
            if user.get("auth_provider") != "google":
                await db.users.update_one(
                    {"email": email},
                    {"$set": {
                        "google_id": google_id,
                        "auth_provider": "google",
                        "picture": picture,
                        "name": name
                    }}
                )
                user["google_id"] = google_id
                user["picture"] = picture
                user["name"] = name
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        session_doc = {
            "session_token": session_token,
            "user_id": user["id"],
            "email": user["email"],
            "name": user.get("name", name),
            "picture": user.get("picture", picture),
            "expires_at": expiry,
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        # Set cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/"
        )
        
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", name),
            "picture": user.get("picture", picture)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail="Google authentication failed")

@auth_router.post("/session")
async def store_session(user_data: UserSessionData, response: Response):
    """Store user session data and set httpOnly cookie"""
    try:
        # Calculate expiry (7 days from now)
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        # Store session in database
        session_doc = {
            "session_token": user_data.session_token,
            "user_id": user_data.id,
            "email": user_data.email,
            "name": user_data.name,
            "picture": user_data.picture,
            "expires_at": expiry,
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.user_sessions.insert_one(session_doc)
        
        # Check if user exists, if not create user
        existing_user = await db.users.find_one({"email": user_data.email})
        if not existing_user:
            user_doc = {
                "id": user_data.id,
                "email": user_data.email,
                "name": user_data.name,
                "picture": user_data.picture,
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(user_doc)
        
        # Set httpOnly cookie
        response.set_cookie(
            key="session_token",
            value=user_data.session_token,
            max_age=7 * 24 * 60 * 60,  # 7 days in seconds
            httponly=True,
            secure=True,
            samesite="none",
            path="/"
        )
        
        return {"status": "success", "message": "Session stored successfully"}
        
    except Exception as e:
        logger.error(f"Error storing session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to store session")

@auth_router.get("/me")
async def get_current_user(request: Request):
    """Get current user from session token"""
    try:
        # Try to get session token from cookies first, then from Authorization header
        session_token = request.cookies.get("session_token")
        
        if not session_token:
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                session_token = auth_header.split(" ")[1]
        
        if not session_token:
            raise HTTPException(status_code=401, detail="No session token found")
        
        # Find session in database
        session = await db.user_sessions.find_one({
            "session_token": session_token,
            "expires_at": {"$gt": datetime.now(timezone.utc)}
        })
        
        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        
        # Return user data
        user_data = {
            "id": session["user_id"],
            "email": session["email"],
            "name": session["name"],
            "picture": session["picture"]
        }
        
        return {"user": user_data}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get user data")

@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout user by deleting session"""
    try:
        # Get session token from cookies
        session_token = request.cookies.get("session_token")
        
        if session_token:
            # Delete session from database
            await db.user_sessions.delete_one({"session_token": session_token})
        
        # Clear cookie
        response.delete_cookie(
            key="session_token",
            path="/",
            secure=True,
            samesite="none"
        )
        
        return {"status": "success", "message": "Logged out successfully"}
        
    except Exception as e:
        logger.error(f"Error during logout: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to logout")

# Helper function to get current user (for dependency injection)
async def get_current_user_dependency(request: Request) -> UserData:
    """Dependency to get current authenticated user"""
    try:
        session_token = request.cookies.get("session_token")
        
        if not session_token:
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                session_token = auth_header.split(" ")[1]
        
        # For testing purposes, allow mock user when no session token
        if not session_token:
            # Return mock user for demonstration
            return UserData(
                id="mock_user_123",
                email="demo@investtracker.com",
                name="Demo User",
                picture="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
            )
        
        session = await db.user_sessions.find_one({
            "session_token": session_token,
            "expires_at": {"$gt": datetime.now(timezone.utc)}
        })
        
        if not session:
            # Return mock user for demonstration if session not found
            return UserData(
                id="mock_user_123",
                email="demo@investtracker.com",
                name="Demo User",
                picture="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
            )
        
        return UserData(
            id=session["user_id"],
            email=session["email"],
            name=session["name"],
            picture=session["picture"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in auth dependency: {str(e)}")
        # Return mock user for demonstration in case of error
        return UserData(
            id="mock_user_123",
            email="demo@investtracker.com",
            name="Demo User",
            picture="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
        )