import { useState, useEffect } from 'react';
import { apiClient } from '../utils/api';

export function useSystemStats() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setError(null);
      const response = await apiClient.get('/stats');
      setStats(response.data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch system stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return { stats, isLoading, error, refetch: fetchStats };
}