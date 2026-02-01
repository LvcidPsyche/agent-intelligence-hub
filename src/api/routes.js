import express from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { query } from '../utils/database.js';
import { cacheGet, cacheSet } from '../utils/redis.js';
import { getCollectorStats } from '../collectors/index.js';
import { getAnalyzerStats } from '../analyzers/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'api_rate_limit',
  points: 100, // Number of requests
  duration: 900, // Per 15 minutes
});

const rateLimitMiddleware = async (req, res, next) => {
  try {
    const key = req.ip || 'unknown';
    await rateLimiter.consume(key);
    next();
  } catch {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Try again later.'
    });
  }
};

// Apply rate limiting to all API routes
router.use('/api/v1', rateLimitMiddleware);

// API Documentation endpoint
router.get('/api/v1', (req, res) => {
  res.json({
    name: 'Agent Intelligence Hub API',
    version: '0.1.0',
    description: 'Cross-platform intelligence aggregation for the autonomous agent ecosystem',
    endpoints: {
      '/api/v1/stats': 'System statistics and status',
      '/api/v1/agents': 'Agent data and rankings',
      '/api/v1/posts': 'Post data and trends',
      '/api/v1/security': 'Security alerts and analysis',
      '/api/v1/analytics': 'Analytics and insights'
    },
    docs: 'https://github.com/grandmasterclawd/agent-intelligence-hub'
  });
});

// System stats endpoint
router.get('/api/v1/stats', async (req, res) => {
  try {
    const cacheKey = 'api:stats';
    let stats = await cacheGet(cacheKey);

    if (!stats) {
      const [agentCount, postCount, alertCount] = await Promise.all([
        query('SELECT COUNT(*) as count FROM agents'),
        query('SELECT COUNT(*) as count FROM posts'),
        query('SELECT COUNT(*) as count FROM security_alerts WHERE NOT resolved')
      ]);

      stats = {
        agents: parseInt(agentCount.rows[0].count),
        posts: parseInt(postCount.rows[0].count),
        securityAlerts: parseInt(alertCount.rows[0].count),
        collectors: getCollectorStats(),
        analyzers: getAnalyzerStats(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      // Cache for 5 minutes
      await cacheSet(cacheKey, stats, 300);
    }

    res.json(stats);
  } catch (error) {
    logger.error('Stats endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Agents endpoint
router.get('/api/v1/agents', async (req, res) => {
  try {
    const { platform, limit = 50, sort = 'reputation_score' } = req.query;
    const cacheKey = `api:agents:${platform}:${limit}:${sort}`;
    
    let agents = await cacheGet(cacheKey);
    
    if (!agents) {
      let whereClause = '';
      let params = [];
      
      if (platform) {
        whereClause = 'WHERE platform = $1';
        params.push(platform);
      }

      const result = await query(`
        SELECT 
          name, platform, reputation_score, 
          is_verified, first_seen, last_seen,
          (metadata->>'external_author_id') as external_id
        FROM agents 
        ${whereClause}
        ORDER BY ${sort} DESC 
        LIMIT ${parseInt(limit)}
      `, params);

      agents = result.rows;
      
      // Cache for 10 minutes
      await cacheSet(cacheKey, agents, 600);
    }

    res.json({
      agents,
      count: agents.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Agents endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Posts endpoint
router.get('/api/v1/posts', async (req, res) => {
  try {
    const { platform, submolt, limit = 50, sort = 'created_at' } = req.query;
    const cacheKey = `api:posts:${platform}:${submolt}:${limit}:${sort}`;
    
    let posts = await cacheGet(cacheKey);
    
    if (!posts) {
      let whereConditions = [];
      let params = [];
      let paramCount = 0;

      if (platform) {
        paramCount++;
        whereConditions.push(`platform = $${paramCount}`);
        params.push(platform);
      }

      if (submolt) {
        paramCount++;
        whereConditions.push(`submolt = $${paramCount}`);
        params.push(submolt);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const result = await query(`
        SELECT 
          p.external_id, p.platform, p.title, p.content, p.url,
          p.upvotes, p.downvotes, p.comment_count, p.submolt,
          p.created_at, a.name as author_name
        FROM posts p
        LEFT JOIN agents a ON p.agent_id = a.id
        ${whereClause}
        ORDER BY p.${sort} DESC 
        LIMIT ${parseInt(limit)}
      `, params);

      posts = result.rows;
      
      // Cache for 5 minutes
      await cacheSet(cacheKey, posts, 300);
    }

    res.json({
      posts,
      count: posts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Posts endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Security alerts endpoint
router.get('/api/v1/security', async (req, res) => {
  try {
    const { severity, resolved = 'false', limit = 50 } = req.query;
    const cacheKey = `api:security:${severity}:${resolved}:${limit}`;
    
    let alerts = await cacheGet(cacheKey);
    
    if (!alerts) {
      let whereConditions = ['1=1'];
      let params = [];
      let paramCount = 0;

      if (severity) {
        paramCount++;
        whereConditions.push(`severity = $${paramCount}`);
        params.push(severity);
      }

      if (resolved === 'false') {
        whereConditions.push('NOT resolved');
      } else if (resolved === 'true') {
        whereConditions.push('resolved');
      }

      const result = await query(`
        SELECT 
          id, type, severity, title, description, 
          resolved, created_at, metadata
        FROM security_alerts 
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY created_at DESC 
        LIMIT ${parseInt(limit)}
      `, params);

      alerts = result.rows;
      
      // Cache for 2 minutes (security data should be fresh)
      await cacheSet(cacheKey, alerts, 120);
    }

    res.json({
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Security endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch security alerts' });
  }
});

// Analytics endpoint
router.get('/api/v1/analytics', async (req, res) => {
  try {
    const { type, limit = 10 } = req.query;
    const cacheKey = `api:analytics:${type}:${limit}`;
    
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let whereClause = '';
      let params = [];

      if (type) {
        whereClause = 'WHERE snapshot_type = $1';
        params.push(type);
      }

      const result = await query(`
        SELECT snapshot_type, data, created_at
        FROM analytics_snapshots 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT ${parseInt(limit)}
      `, params);

      analytics = result.rows;
      
      // Cache for 15 minutes
      await cacheSet(cacheKey, analytics, 900);
    }

    res.json({
      analytics,
      count: analytics.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Analytics endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Trends endpoint - aggregated intelligence
router.get('/api/v1/trends', async (req, res) => {
  try {
    const cacheKey = 'api:trends';
    let trends = await cacheGet(cacheKey);

    if (!trends) {
      const [topAgents, topPosts, recentAlerts, submoltTrends] = await Promise.all([
        // Top agents by recent activity
        query(`
          SELECT a.name, a.platform, a.reputation_score,
            COUNT(p.id) as recent_posts
          FROM agents a
          LEFT JOIN posts p ON a.id = p.agent_id 
            AND p.created_at > NOW() - INTERVAL '24 hours'
          GROUP BY a.id, a.name, a.platform, a.reputation_score
          ORDER BY recent_posts DESC, a.reputation_score DESC
          LIMIT 10
        `),
        
        // Trending posts (high engagement)
        query(`
          SELECT external_id, title, upvotes, downvotes, 
            comment_count, submolt, created_at
          FROM posts 
          WHERE created_at > NOW() - INTERVAL '24 hours'
          ORDER BY (upvotes + comment_count * 2) DESC
          LIMIT 10
        `),
        
        // Recent high-severity alerts
        query(`
          SELECT type, severity, COUNT(*) as count
          FROM security_alerts 
          WHERE created_at > NOW() - INTERVAL '24 hours'
            AND NOT resolved
          GROUP BY type, severity
          ORDER BY count DESC
          LIMIT 10
        `),
        
        // Latest submolt trends
        query(`
          SELECT data
          FROM analytics_snapshots 
          WHERE snapshot_type = 'submolt_trends'
          ORDER BY created_at DESC
          LIMIT 1
        `)
      ]);

      trends = {
        topAgents: topAgents.rows,
        trendingPosts: topPosts.rows,
        securityAlerts: recentAlerts.rows,
        submoltTrends: submoltTrends.rows[0]?.data || {},
        generatedAt: new Date().toISOString()
      };

      // Cache for 30 minutes
      await cacheSet(cacheKey, trends, 1800);
    }

    res.json(trends);
  } catch (error) {
    logger.error('Trends endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

export function setupRoutes(app) {
  app.use('/', router);
}