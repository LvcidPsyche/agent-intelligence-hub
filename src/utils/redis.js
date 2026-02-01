import { createClient } from 'redis';
import logger from './logger.js';

let redisClient;

export async function connectRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    throw error;
  }
}

export function getRedis() {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function cacheGet(key) {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error(`Redis GET error for key ${key}:`, error);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 3600) {
  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error(`Redis SET error for key ${key}:`, error);
  }
}

export async function cacheDel(key) {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error(`Redis DEL error for key ${key}:`, error);
  }
}