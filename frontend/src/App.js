import React from 'react';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Profile from './components/Profile';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';

function App() {
  const { 
    user, 
    loading, 
    error, 
    isAuthenticated, 
    login, 
    logout, 
    clearError 
  } = useAuth();

  // Show loading spinner while checking authentication
  if (loading && !user) {
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // Show profile if user is authenticated
  if (isAuthenticated) {
    return (
      <Profile 
        user={user} 
        onLogout={logout} 
        loading={loading}
      />
    );
  }

  // Show login page if not authenticated
  return (
    <Login
      onGoogleLogin={login.google}
      onGitHubLogin={login.github}
      error={error}
      loading={loading}
      onClearError={clearError}
    />
  );
}

export default App;
