import { useState, useEffect, useCallback } from 'react';
import authAPI from '../api/auth';

// Custom hook for authentication state management
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is authenticated
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (err) {
      if (err.message === 'Not authenticated') {
        setUser(null);
      } else {
        setError(err.message);
        console.error('Auth check failed:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await authAPI.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Logout failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Login with Google
  const loginWithGoogle = useCallback(() => {
    window.location.href = authAPI.getGoogleLoginUrl();
  }, []);

  // Login with GitHub
  const loginWithGitHub = useCallback(() => {
    window.location.href = authAPI.getGitHubLoginUrl();
  }, []);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Check for OAuth callback errors in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    
    if (error) {
      setError(`Authentication failed: ${error}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login: {
      google: loginWithGoogle,
      github: loginWithGitHub,
    },
    logout,
    checkAuth,
    clearError: () => setError(null),
  };
};
