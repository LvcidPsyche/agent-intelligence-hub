import { Server } from 'socket.io';
import logger from './utils/logger.js';

let io;
const connectedClients = new Map();

export function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://agent-intel-hub.io']
        : ['http://localhost:3001', 'http://localhost:3000'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    const clientInfo = {
      id: socket.id,
      connectedAt: new Date(),
      userAgent: socket.handshake.headers['user-agent'],
      ip: socket.handshake.address
    };
    
    connectedClients.set(socket.id, clientInfo);
    
    logger.info(`WebSocket client connected: ${socket.id}`, {
      totalClients: connectedClients.size,
      userAgent: clientInfo.userAgent?.substring(0, 100)
    });

    // Send initial connection confirmation
    socket.emit('connection-established', {
      clientId: socket.id,
      serverTime: new Date().toISOString(),
      features: ['real-time-updates', 'security-alerts', 'agent-tracking']
    });

    socket.on('subscribe', (channels) => {
      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          socket.join(channel);
          logger.debug(`Client ${socket.id} subscribed to ${channel}`);
        });
      }
    });

    socket.on('unsubscribe', (channels) => {
      if (Array.isArray(channels)) {
        channels.forEach(channel => {
          socket.leave(channel);
          logger.debug(`Client ${socket.id} unsubscribed from ${channel}`);
        });
      }
    });

    socket.on('disconnect', (reason) => {
      connectedClients.delete(socket.id);
      logger.info(`WebSocket client disconnected: ${socket.id}`, {
        reason,
        totalClients: connectedClients.size
      });
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
  });

  return io;
}

export function broadcastUpdate(event, data, room = null) {
  if (!io) {
    logger.warn('WebSocket not initialized, cannot broadcast update');
    return;
  }

  const payload = {
    event,
    data,
    timestamp: new Date().toISOString(),
    server: 'agent-intelligence-hub'
  };

  if (room) {
    io.to(room).emit(event, payload);
    logger.debug(`Broadcasted ${event} to room ${room}`, { dataKeys: Object.keys(data) });
  } else {
    io.emit(event, payload);
    logger.debug(`Broadcasted ${event} to all clients`, { 
      clients: connectedClients.size,
      dataKeys: Object.keys(data) 
    });
  }
}

export function getConnectedClients() {
  return {
    count: connectedClients.size,
    clients: Array.from(connectedClients.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt,
      userAgent: client.userAgent?.substring(0, 50) + '...'
    }))
  };
}

// Broadcast different types of updates
export const broadcasts = {
  agentUpdate: (data) => broadcastUpdate('agent-update', data),
  securityAlert: (data) => broadcastUpdate('security-alert', data, 'security'),
  postUpdate: (data) => broadcastUpdate('post-update', data),
  statsUpdate: (data) => broadcastUpdate('stats-update', data),
  systemAlert: (data) => broadcastUpdate('system-alert', data),
};