import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // No mock user
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Start unauthenticated

  // Check for existing session on app load (only if no OAuth callback)
  // useEffect(() => {
  //   checkExistingSession();
  // }, []);

  // Check for existing session on app load
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        withCredentials: true
      });
      
      if (response.data.user) {
        setUser(response.data.user);
        setIsAuthenticated(true);
      }
    } catch (error) {
      // No existing session, user needs to login
      // 401 is expected when not logged in - suppress console error
      if (error.response?.status === 401) {
        // Normal - no session exists, user needs to login
        // Don't log this as an error
      } else {
        console.error('Error checking session:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, {
        withCredentials: true
      });
      
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear local state even if backend call fails
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    logout,
    checkExistingSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};