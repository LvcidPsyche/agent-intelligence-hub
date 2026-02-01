import { useState, useEffect } from 'react';
import { api } from '../utils/api';

export function useTrends() {
  const [trends, setTrends] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTrends = async () => {
    try {
      setError(null);
      const response = await api.getTrends();
      setTrends(response.data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch trends:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
    
    // Refresh trends every 5 minutes
    const interval = setInterval(fetchTrends, 300000);
    
    return () => clearInterval(interval);
  }, []);

  return { trends, isLoading, error, refetch: fetchTrends };
}