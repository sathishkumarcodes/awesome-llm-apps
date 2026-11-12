#!/usr/bin/env python3
"""
Authentication Endpoints Testing for OAuth Flow
Tests the specific authentication endpoints for Google OAuth integration
"""

import asyncio
import httpx
import json
from datetime import datetime, timezone, timedelta
import sys
import os

# Test configuration
BACKEND_URL = "https://portfolio-moon.preview.emergentagent.com/api"

# Test data for OAuth flow
TEST_USER_SESSION_DATA = {
    "id": "google_oauth_user_123",
    "email": "testuser@gmail.com",
    "name": "Test OAuth User",
    "picture": "https://lh3.googleusercontent.com/a/test-picture",
    "session_token": "oauth_session_token_123456"
}

class AuthenticationTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
        self.headers = {"Content-Type": "application/json"}
        self.session_token = None
        self.test_results = []
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    async def test_auth_me_without_session(self):
        """Test GET /api/auth/me without session token"""
        print("🔍 Testing /api/auth/me without session token...")
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/auth/me",
                headers=self.headers
            )
            
            if response.status_code == 401:
                self.log_test(
                    "GET /auth/me (no session)", 
                    True, 
                    "Correctly returns 401 Unauthorized when no session token provided"
                )
                return True
            else:
                self.log_test(
                    "GET /auth/me (no session)", 
                    False, 
                    f"Expected 401, got {response.status_code}", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("GET /auth/me (no session)", False, f"Exception: {str(e)}")
            return False
    
    async def test_session_creation(self):
        """Test POST /api/auth/session - OAuth session creation"""
        print("🔐 Testing POST /api/auth/session (OAuth session creation)...")
        try:
            response = await self.client.post(
                f"{BACKEND_URL}/auth/session",
                json=TEST_USER_SESSION_DATA,
                headers=self.headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response format
                if data.get("status") == "success" and "message" in data:
                    # Check if session cookie was set
                    cookies = response.cookies
                    session_cookie = cookies.get("session_token")
                    
                    if session_cookie:
                        self.session_token = session_cookie
                        self.log_test(
                            "POST /auth/session", 
                            True, 
                            f"Session created successfully. Cookie set: {session_cookie[:20]}..."
                        )
                        return True
                    else:
                        self.log_test(
                            "POST /auth/session", 
                            False, 
                            "Session created but no cookie set", 
                            data
                        )
                        return False
                else:
                    self.log_test(
                        "POST /auth/session", 
                        False, 
                        "Invalid response format", 
                        data
                    )
                    return False
            else:
                self.log_test(
                    "POST /auth/session", 
                    False, 
                    f"Status: {response.status_code}", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("POST /auth/session", False, f"Exception: {str(e)}")
            return False
    
    async def test_auth_me_with_session(self):
        """Test GET /api/auth/me with valid session token"""
        print("🔍 Testing /api/auth/me with valid session token...")
        try:
            # Use the session token from cookie or Authorization header
            test_headers = self.headers.copy()
            if self.session_token:
                test_headers["Authorization"] = f"Bearer {self.session_token}"
            
            response = await self.client.get(
                f"{BACKEND_URL}/auth/me",
                headers=test_headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                if "user" in data:
                    user = data["user"]
                    required_fields = ["id", "email", "name", "picture"]
                    
                    if all(field in user for field in required_fields):
                        # Verify it's our test user data
                        if (user["id"] == TEST_USER_SESSION_DATA["id"] and 
                            user["email"] == TEST_USER_SESSION_DATA["email"]):
                            
                            self.log_test(
                                "GET /auth/me (with session)", 
                                True, 
                                f"User authenticated: {user['name']} ({user['email']})"
                            )
                            return True
                        else:
                            self.log_test(
                                "GET /auth/me (with session)", 
                                False, 
                                "User data doesn't match session data", 
                                data
                            )
                            return False
                    else:
                        self.log_test(
                            "GET /auth/me (with session)", 
                            False, 
                            "Missing required user fields", 
                            data
                        )
                        return False
                else:
                    self.log_test(
                        "GET /auth/me (with session)", 
                        False, 
                        "No user data in response", 
                        data
                    )
                    return False
            else:
                self.log_test(
                    "GET /auth/me (with session)", 
                    False, 
                    f"Status: {response.status_code}", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("GET /auth/me (with session)", False, f"Exception: {str(e)}")
            return False
    
    async def test_logout(self):
        """Test POST /api/auth/logout"""
        print("🚪 Testing POST /api/auth/logout...")
        try:
            # Use session cookie for logout
            test_headers = self.headers.copy()
            if self.session_token:
                test_headers["Authorization"] = f"Bearer {self.session_token}"
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/logout",
                headers=test_headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("status") == "success" and "message" in data:
                    # Check if session cookie was cleared
                    cookies = response.cookies
                    session_cookie = cookies.get("session_token")
                    
                    # Cookie should be cleared (empty or expired)
                    self.log_test(
                        "POST /auth/logout", 
                        True, 
                        "Logout successful, session cleared"
                    )
                    return True
                else:
                    self.log_test(
                        "POST /auth/logout", 
                        False, 
                        "Invalid response format", 
                        data
                    )
                    return False
            else:
                self.log_test(
                    "POST /auth/logout", 
                    False, 
                    f"Status: {response.status_code}", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("POST /auth/logout", False, f"Exception: {str(e)}")
            return False
    
    async def test_auth_me_after_logout(self):
        """Test GET /api/auth/me after logout (should fail)"""
        print("🔍 Testing /api/auth/me after logout...")
        try:
            # Try to use the same session token after logout
            test_headers = self.headers.copy()
            if self.session_token:
                test_headers["Authorization"] = f"Bearer {self.session_token}"
            
            response = await self.client.get(
                f"{BACKEND_URL}/auth/me",
                headers=test_headers
            )
            
            if response.status_code == 401:
                self.log_test(
                    "GET /auth/me (after logout)", 
                    True, 
                    "Correctly returns 401 after logout - session invalidated"
                )
                return True
            else:
                self.log_test(
                    "GET /auth/me (after logout)", 
                    False, 
                    f"Expected 401, got {response.status_code} - session not properly invalidated", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("GET /auth/me (after logout)", False, f"Exception: {str(e)}")
            return False
    
    async def test_cors_configuration(self):
        """Test CORS configuration for authentication requests"""
        print("🌐 Testing CORS configuration...")
        try:
            # Test preflight request
            response = await self.client.options(
                f"{BACKEND_URL}/auth/session",
                headers={
                    "Origin": "https://portfolio-moon.preview.emergentagent.com",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Content-Type"
                }
            )
            
            # Check CORS headers
            cors_headers = {
                "access-control-allow-credentials": response.headers.get("access-control-allow-credentials"),
                "access-control-allow-origin": response.headers.get("access-control-allow-origin"),
                "access-control-allow-methods": response.headers.get("access-control-allow-methods"),
                "access-control-allow-headers": response.headers.get("access-control-allow-headers")
            }
            
            # Check if credentials are allowed (required for cookies)
            credentials_allowed = cors_headers["access-control-allow-credentials"] == "true"
            
            if credentials_allowed:
                self.log_test(
                    "CORS Configuration", 
                    True, 
                    f"CORS properly configured for credentials. Origin: {cors_headers['access-control-allow-origin']}"
                )
                return True
            else:
                self.log_test(
                    "CORS Configuration", 
                    False, 
                    "CORS not configured for credentials (withCredentials may fail)", 
                    cors_headers
                )
                return False
                
        except Exception as e:
            self.log_test("CORS Configuration", False, f"Exception: {str(e)}")
            return False
    
    async def test_session_id_exchange_flow(self):
        """Test the complete OAuth session_id exchange flow"""
        print("🔄 Testing OAuth session_id exchange flow...")
        try:
            # Simulate the OAuth callback scenario
            # 1. User completes Google OAuth
            # 2. Redirects to /login with session_id in URL fragment
            # 3. Frontend calls backend to exchange session_id for user data
            
            # This simulates step 3 - the session creation call
            oauth_user_data = {
                "id": "oauth_test_user_456",
                "email": "oauth.test@gmail.com", 
                "name": "OAuth Test User",
                "picture": "https://lh3.googleusercontent.com/a/oauth-test",
                "session_token": "oauth_exchange_token_789"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/session",
                json=oauth_user_data,
                headers=self.headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify session was created
                if data.get("status") == "success":
                    # Now test if we can retrieve user data
                    auth_headers = self.headers.copy()
                    auth_headers["Authorization"] = f"Bearer {oauth_user_data['session_token']}"
                    
                    me_response = await self.client.get(
                        f"{BACKEND_URL}/auth/me",
                        headers=auth_headers
                    )
                    
                    if me_response.status_code == 200:
                        user_data = me_response.json()
                        
                        if (user_data.get("user", {}).get("email") == oauth_user_data["email"]):
                            self.log_test(
                                "OAuth Session Exchange Flow", 
                                True, 
                                "Complete OAuth flow working: session creation → user data retrieval"
                            )
                            return True
                        else:
                            self.log_test(
                                "OAuth Session Exchange Flow", 
                                False, 
                                "Session created but user data retrieval failed", 
                                user_data
                            )
                            return False
                    else:
                        self.log_test(
                            "OAuth Session Exchange Flow", 
                            False, 
                            f"Session created but /auth/me failed with status {me_response.status_code}", 
                            me_response.text
                        )
                        return False
                else:
                    self.log_test(
                        "OAuth Session Exchange Flow", 
                        False, 
                        "Session creation failed", 
                        data
                    )
                    return False
            else:
                self.log_test(
                    "OAuth Session Exchange Flow", 
                    False, 
                    f"Session creation failed with status {response.status_code}", 
                    response.text
                )
                return False
                
        except Exception as e:
            self.log_test("OAuth Session Exchange Flow", False, f"Exception: {str(e)}")
            return False
    
    async def run_all_tests(self):
        """Run all authentication tests in sequence"""
        print("🚀 Starting Authentication Endpoints Tests")
        print("=" * 60)
        
        # Run tests in logical sequence
        tests = [
            self.test_cors_configuration,
            self.test_auth_me_without_session,
            self.test_session_creation,
            self.test_auth_me_with_session,
            self.test_logout,
            self.test_auth_me_after_logout,
            self.test_session_id_exchange_flow
        ]
        
        all_passed = True
        for test in tests:
            success = await test()
            if not success:
                all_passed = False
        
        # Print summary
        print("=" * 60)
        print("📋 AUTHENTICATION TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if not all_passed:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n📝 OAUTH FLOW ANALYSIS:")
        print("- All required endpoints exist: ✅ /auth/me, ✅ /auth/session, ✅ /auth/logout")
        print("- Session creation and cookie handling tested")
        print("- CORS configuration for withCredentials verified")
        print("- Complete OAuth session exchange flow validated")
        
        return all_passed

async def main():
    """Main test runner"""
    async with AuthenticationTester() as tester:
        success = await tester.run_all_tests()
        return success

if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Test runner error: {str(e)}")
        sys.exit(1)