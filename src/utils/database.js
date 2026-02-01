import pkg from 'pg';
const { Pool } = pkg;
import logger from './logger.js';

let pool;

export async function connectDatabase() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('✅ PostgreSQL connected');
    return pool;
  } catch (error) {
    logger.error('❌ PostgreSQL connection failed:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return pool;
}

export async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Database schema initialization
export async function initializeSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS public;
      
      -- Agents table
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        platform VARCHAR(50) NOT NULL,
        external_id VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        first_seen TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW(),
        is_verified BOOLEAN DEFAULT FALSE,
        reputation_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Posts table
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) NOT NULL,
        agent_id INTEGER REFERENCES agents(id),
        platform VARCHAR(50) NOT NULL,
        title TEXT,
        content TEXT,
        url TEXT,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        submolt VARCHAR(255),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(platform, external_id)
      );

      -- Security alerts table
      CREATE TABLE IF NOT EXISTS security_alerts (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Analytics snapshots table
      CREATE TABLE IF NOT EXISTS analytics_snapshots (
        id SERIAL PRIMARY KEY,
        snapshot_type VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
      CREATE INDEX IF NOT EXISTS idx_agents_platform ON agents(platform);
      CREATE INDEX IF NOT EXISTS idx_posts_agent_id ON posts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
      CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(type);
      CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_type ON analytics_snapshots(snapshot_type);
    `);

    logger.info('✅ Database schema initialized');
  } catch (error) {
    logger.error('❌ Schema initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}