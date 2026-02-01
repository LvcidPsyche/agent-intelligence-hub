import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export function useRealtimeUpdates() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Real-time connection established');
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('disconnected');
      console.log('Real-time connection lost');
    });

    socketInstance.on('reconnect', () => {
      setConnectionStatus('connected');
      console.log('Real-time connection restored');
    });

    // Listen for various update types
    socketInstance.on('agent-update', (data) => {
      setLastUpdate(new Date());
      setUpdates(prev => [...prev.slice(-99), { type: 'agent', data, timestamp: new Date() }]);
    });

    socketInstance.on('security-alert', (data) => {
      setLastUpdate(new Date());
      setUpdates(prev => [...prev.slice(-99), { type: 'security', data, timestamp: new Date() }]);
    });

    socketInstance.on('post-update', (data) => {
      setLastUpdate(new Date());
      setUpdates(prev => [...prev.slice(-99), { type: 'post', data, timestamp: new Date() }]);
    });

    socketInstance.on('stats-update', (data) => {
      setLastUpdate(new Date());
      setUpdates(prev => [...prev.slice(-99), { type: 'stats', data, timestamp: new Date() }]);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return {
    socket,
    connectionStatus,
    lastUpdate,
    updates,
  };
}