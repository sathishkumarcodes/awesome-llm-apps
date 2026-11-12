"""
Authentication module using Supabase PostgreSQL
"""
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone, timedelta
import os
import logging
import httpx
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
from passlib.context import CryptContext
import uuid
from db_supabase import get_db_pool, execute_one, execute_insert, execute_update, execute_query

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
    """Register a new Moona user account - Optimized for speed"""
    try:
        pool = await get_db_pool()
        
        # Normalize email
        normalized_email = user_data.email.lower().strip()
        
        # Check if user already exists - optimized query
        existing_user = await execute_one(
            "SELECT id FROM users WHERE email = $1 LIMIT 1",
            normalized_email
        )
        
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password - use faster rounds for better UX (still secure)
        hashed_password = pwd_context.hash(user_data.password)
        
        # Create user
        user_name = user_data.name or user_data.email.split("@")[0].replace(".", " ").title()
        user_picture = f"https://ui-avatars.com/api/?name={user_data.email.split('@')[0]}&background=random"
        
        user = await execute_insert(
            """INSERT INTO users (email, name, picture, password_hash, auth_provider)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id, email, name, picture""",
            normalized_email,
            user_name,
            user_picture,
            hashed_password,
            'moona'
        )
        
        user_id = str(user['id'])
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        await execute_insert(
            """INSERT INTO user_sessions (session_token, user_id, email, name, picture, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id""",
            session_token,
            user_id,
            normalized_email,
            user_name,
            user_picture,
            expiry
        )
        
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
            "email": user['email'],
            "name": user['name'],
            "picture": user['picture']
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@auth_router.post("/login")
async def login(login_data: LoginRequest, response: Response):
    """Login with Moona account (email/password) - Optimized for speed"""
    try:
        pool = await get_db_pool()
        
        # Find user - optimized query
        user = await execute_one(
            "SELECT id, email, name, picture, password_hash, auth_provider FROM users WHERE email = $1 LIMIT 1",
            login_data.email.lower().strip()  # Normalize email
        )
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Check if user has password (Moona account)
        if not user['password_hash']:
            raise HTTPException(status_code=401, detail="Please use Google login for this account")
        
        # Verify password - fast bcrypt verification
        if not pwd_context.verify(login_data.password, user['password_hash']):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        user_name = user['name'] or user['email'].split("@")[0]
        user_picture = user['picture'] or f"https://ui-avatars.com/api/?name={user_name}&background=random"
        
        await execute_insert(
            """INSERT INTO user_sessions (session_token, user_id, email, name, picture, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id""",
            session_token,
            str(user['id']),
            user['email'],
            user_name,
            user_picture,
            expiry
        )
        
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
            "id": str(user['id']),
            "email": user['email'],
            "name": user_name,
            "picture": user_picture
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@auth_router.get("/google/callback")
async def google_callback(code: str, state: str, response: Response):
    """Handle Google OAuth callback"""
    try:
        google_client_id = os.environ.get('GOOGLE_CLIENT_ID')
        google_client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
        
        if not google_client_id or not google_client_secret:
            raise HTTPException(status_code=500, detail="Google OAuth not configured")
        
        # Check Supabase connection
        try:
            pool = await get_db_pool()
        except ValueError as e:
            logger.error(f"Supabase connection error: {str(e)}")
            raise HTTPException(
                status_code=503,
                detail="Database not configured. Please set SUPABASE_DB_URL in backend/.env. See SUPABASE_SETUP.md for instructions."
            )
        except Exception as e:
            logger.error(f"Database connection error: {str(e)}")
            raise HTTPException(
                status_code=503,
                detail=f"Database connection failed: {str(e)}. Please check your Supabase configuration."
            )
        
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": google_client_id,
                    "client_secret": google_client_secret,
                    "redirect_uri": f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/login",
                    "grant_type": "authorization_code"
                },
                timeout=10.0
            )
            
            if token_response.status_code != 200:
                error_detail = "Failed to exchange code for token"
                try:
                    error_data = token_response.json()
                    error_detail = f"Failed to exchange code: {error_data.get('error', 'unknown')} - {error_data.get('error_description', 'no description')}"
                    error_msg = f"Google OAuth token exchange failed: {error_data}"
                    logger.error(error_msg)
                    print(f"\n❌ {error_msg}\n")  # Print to console
                except Exception as parse_error:
                    error_detail = f"Failed to exchange code (HTTP {token_response.status_code})"
                    logger.error(f"Could not parse error response: {parse_error}")
                    print(f"\n❌ Token exchange failed with status {token_response.status_code}\n")
                raise HTTPException(status_code=401, detail=error_detail)
            
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
        try:
            user = await execute_one(
                "SELECT id, email, name, picture, auth_provider FROM users WHERE email = $1",
                email
            )
        except Exception as db_error:
            error_str = str(db_error).lower()
            if 'does not exist' in error_str or 'relation' in error_str or 'table' in error_str:
                logger.error(f"Database table error: {str(db_error)}")
                raise HTTPException(
                    status_code=503,
                    detail="Database tables not found. Please run the SQL migration in Supabase. See QUICK_SUPABASE_FIX.md for instructions."
                )
            raise
        
        is_new_user = False
        if not user:
            # Create new user
            is_new_user = True
            new_user = await execute_insert(
                """INSERT INTO users (email, name, picture, google_id, auth_provider)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, email, name, picture""",
                email, name, picture, google_id, 'google'
            )
            user_id = str(new_user['id'])
            user_name = new_user['name']
            user_picture = new_user['picture']
        else:
            user_id = str(user['id'])
            user_name = user['name'] or name
            user_picture = user['picture'] or picture
            
            # Update user if needed
            if user.get('auth_provider') != 'google':
                await execute_update(
                    """UPDATE users SET google_id = $1, auth_provider = $2, picture = $3, name = $4
                       WHERE id = $5""",
                    google_id, 'google', picture, name, user_id
                )
        
        # Create session
        session_token = str(uuid.uuid4())
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        await execute_insert(
            """INSERT INTO user_sessions (session_token, user_id, email, name, picture, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id""",
            session_token, user_id, email, user_name, user_picture, expiry
        )
        
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
            "email": email,
            "name": user_name,
            "picture": user_picture,
            "existing_user": not is_new_user
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_str = str(e).lower()
        # Log to both logger and print to console for visibility
        error_msg = f"Google auth error: {str(e)}\nFull traceback:\n{error_trace}"
        logger.error(error_msg)
        print(f"\n❌ GOOGLE AUTH ERROR:\n{error_msg}\n")  # Also print to console
        
        # Check for specific error types
        if "supabase_db_url" in error_str or "not set" in error_str:
            raise HTTPException(
                status_code=503,
                detail="Supabase not configured. Please set SUPABASE_DB_URL in backend/.env. See SUPABASE_SETUP.md for instructions."
            )
        elif "connection" in error_str or "database" in error_str:
            raise HTTPException(
                status_code=503,
                detail=f"Database connection failed: {str(e)}. Please check your Supabase configuration."
            )
        
        # Log full error for debugging
        logger.error(f"Google authentication failed: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        
        # Provide more helpful error message
        error_detail = f"Google authentication failed: {str(e)}"
        if "table" in str(e).lower() or "relation" in str(e).lower() or "does not exist" in str(e).lower():
            error_detail = "Database tables not found. Please run the SQL migration in Supabase. See RUN_MIGRATION_NOW.md"
        elif "connection" in str(e).lower() or "database" in str(e).lower():
            error_detail = f"Database connection error: {str(e)}. Check your Supabase configuration."
        
        raise HTTPException(
            status_code=500, 
            detail=error_detail
        )

@auth_router.post("/session")
async def store_session(user_data: UserSessionData, response: Response):
    """Store user session data and set httpOnly cookie"""
    try:
        pool = await get_db_pool()
        expiry = datetime.now(timezone.utc) + timedelta(days=7)
        
        await execute_insert(
            """INSERT INTO user_sessions (session_token, user_id, email, name, picture, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id""",
            user_data.session_token,
            user_data.id,
            user_data.email,
            user_data.name,
            user_data.picture,
            expiry
        )
        
        # Check if user exists, if not create user
        existing_user = await execute_one(
            "SELECT id FROM users WHERE email = $1",
            user_data.email
        )
        
        if not existing_user:
            await execute_insert(
                """INSERT INTO users (id, email, name, picture)
                   VALUES ($1, $2, $3, $4)
                   RETURNING id""",
                user_data.id,
                user_data.email,
                user_data.name,
                user_data.picture
            )
        
        # Set httpOnly cookie
        response.set_cookie(
            key="session_token",
            value=user_data.session_token,
            max_age=7 * 24 * 60 * 60,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/"
        )
        
        return {"status": "success", "message": "Session stored successfully"}
    except Exception as e:
        logger.error(f"Error storing session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to store session")

@auth_router.get("/me")
async def get_current_user(request: Request):
    """Get current user from session token - returns null if not logged in"""
    try:
        session_token = request.cookies.get("session_token")
        
        if not session_token:
            auth_header = request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                session_token = auth_header.split(" ")[1]
        
        # No session token - return null user (not an error)
        if not session_token:
            return {"user": None}
        
        # Try to get database pool
        try:
            pool = await get_db_pool()
        except Exception as e:
            # Database not configured - return null instead of error
            logger.warning(f"Database not available in /me: {str(e)}")
            return {"user": None}
        
        # Find session
        session = await execute_one(
            """SELECT user_id, email, name, picture FROM user_sessions
               WHERE session_token = $1 AND expires_at > NOW()""",
            session_token
        )
        
        # No valid session - return null (not an error)
        if not session:
            return {"user": None}
        
        # Return user data
        return {
            "user": {
                "id": str(session['user_id']),
                "email": session['email'],
                "name": session['name'],
                "picture": session['picture']
            }
        }
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        # Return null instead of error
        return {"user": None}

@auth_router.post("/logout")
async def logout(request: Request, response: Response):
    """Logout user by deleting session"""
    try:
        session_token = request.cookies.get("session_token")
        
        if session_token:
            pool = await get_db_pool()
            await execute_update(
                "DELETE FROM user_sessions WHERE session_token = $1",
                session_token
            )
        
        # Clear cookie
        response.delete_cookie(
            key="session_token",
            path="/",
            secure=False,
            samesite="lax"
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
        
        logger.debug(f"get_current_user_dependency - session_token present: {bool(session_token)}")
        
        # For testing purposes, allow mock user when no session token
        if not session_token:
            logger.warning("No session token found, returning mock user")
            return UserData(
                id="mock_user_123",
                email="demo@investtracker.com",
                name="Demo User",
                picture="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
            )
        
        pool = await get_db_pool()
        session = await execute_one(
            """SELECT user_id, email, name, picture FROM user_sessions
               WHERE session_token = $1 AND expires_at > NOW()""",
            session_token
        )
        
        if not session:
            logger.warning(f"Session not found or expired for token: {session_token[:8]}...")
            # Return mock user for demonstration if session not found
            return UserData(
                id="mock_user_123",
                email="demo@investtracker.com",
                name="Demo User",
                picture="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
            )
        
        logger.info(f"Authenticated user: {session['email']} (ID: {session['user_id']})")
        return UserData(
            id=str(session['user_id']),
            email=session['email'],
            name=session['name'] or session['email'].split("@")[0],
            picture=session['picture'] or f"https://ui-avatars.com/api/?name={session['email'].split('@')[0]}&background=random"
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

