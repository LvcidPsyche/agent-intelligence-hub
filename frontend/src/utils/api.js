import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api.agent-intel-hub.io'
  : 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || 'An error occurred';
      toast.error(message);
    } else if (error.request) {
      // Network error
      toast.error('Network error - please check your connection');
    } else {
      // Something else happened
      toast.error('An unexpected error occurred');
    }
    
    return Promise.reject(error);
  }
);

// API service functions
export const api = {
  // Stats
  getStats: () => apiClient.get('/stats'),
  
  // Agents
  getAgents: (params = {}) => apiClient.get('/agents', { params }),
  
  // Posts
  getPosts: (params = {}) => apiClient.get('/posts', { params }),
  
  // Security
  getSecurityAlerts: (params = {}) => apiClient.get('/security', { params }),
  
  // Analytics
  getAnalytics: (params = {}) => apiClient.get('/analytics', { params }),
  
  // Trends
  getTrends: () => apiClient.get('/trends'),
};