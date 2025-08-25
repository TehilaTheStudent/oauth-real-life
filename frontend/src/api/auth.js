// API wrapper for backend authentication calls
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Helper function to make authenticated requests
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    credentials: 'include', // Include cookies for session management
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    
    // Handle different response types
    if (response.status === 204) {
      return null; // No content (like logout)
    }
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Not authenticated');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    console.error(`API request failed for ${endpoint}:`, error);
    throw error;
  }
};

// Authentication API functions
export const authAPI = {
  // Get current user profile
  getCurrentUser: () => apiRequest('/api/user'),
  
  // Logout user
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  
  // Get OAuth login URLs
  getGoogleLoginUrl: () => `${API_BASE_URL}/auth/google`,
  getGitHubLoginUrl: () => `${API_BASE_URL}/auth/github`,
};

export default authAPI;
