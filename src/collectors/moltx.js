import axios from 'axios';
import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';

const MOLTX_BASE_URL = 'https://moltx.io/api/v1';
const API_KEY = process.env.MOLTX_API_KEY;

class MoltxCollector {
  constructor() {
    this.isRunning = false;
    this.collectJob = null;
    this.requestCount = 0;
    this.lastCollectionTime = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Moltx collector already running');
      return;
    }

    logger.info('🦀 Starting Moltx collector...');
    
    // Run initial collection
    await this.collect();
    
    // Schedule regular collections every 10 minutes (more frequent for real-time)
    this.collectJob = new CronJob('*/10 * * * *', async () => {
      await this.collect();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ Moltx collector started (10min intervals)');
  }

  async stop() {
    if (this.collectJob) {
      this.collectJob.stop();
      this.collectJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Moltx collector stopped');
  }

  async collect() {
    try {
      logger.info('📡 Starting Moltx collection cycle...');
      const startTime = Date.now();

      // Collect trending posts
      const trending = await this.fetchTrendingPosts(30);
      await this.storePosts(trending.posts);

      // Collect new posts (last 10 min)
      const recent = await this.fetchRecentPosts(50);
      await this.storePostsWithEngagement(recent.posts);

      // Collect top agents
      const topAgents = await this.fetchTopAgents(50);
      await this.storeAgentMetrics(topAgents.agents);

      // Collect following relationships for identity mapping
      await this.collectFollowingRelationships();

      // Update engagement metrics
      await this.updateEngagementMetrics();

      const duration = Date.now() - startTime;
      this.lastCollectionTime = new Date();

      logger.info(`✅ Moltx collection completed in ${duration}ms`, {
        trendingPosts: trending.posts.length,
        recentPosts: recent.posts.length,
        topAgents: topAgents.agents.length,
        totalRequests: this.requestCount
      });

    } catch (error) {
      logger.error('❌ Moltx collection failed:', error);
    }
  }

  async fetchTrendingPosts(limit = 25) {
    const url = `${MOLTX_BASE_URL}/posts/trending`;
    const params = { limit, timerange: '24h' };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch trending posts:', error.message);
      throw error;
    }
  }

  async fetchRecentPosts(limit = 50) {
    const url = `${MOLTX_BASE_URL}/posts/recent`;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const params = { limit, since: tenMinutesAgo };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch recent posts:', error.message);
      throw error;
    }
  }

  async fetchTopAgents(limit = 50) {
    const url = `${MOLTX_BASE_URL}/agents/top`;
    const params = { 
      limit,
      sort: 'followers',
      timerange: '7d'
    };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch top agents:', error.message);
      throw error;
    }
  }

  async collectFollowingRelationships() {
    // Get list of known agents and collect their following relationships
    const agents = await query(`
      SELECT DISTINCT external_id, name 
      FROM agents 
      WHERE platform = 'moltx' 
      LIMIT 100
    `);

    for (const agent of agents.rows) {
      try {
        const following = await this.fetchFollowing(agent.external_id, 50);
        await this.storeFollowingRelationships(agent.external_id, following);
      } catch (error) {
        logger.debug(`Failed to fetch following for ${agent.name}:`, error.message);
      }
    }
  }

  async fetchFollowing(agentId, limit = 50) {
    const url = `${MOLTX_BASE_URL}/agents/${agentId}/following`;
    const params = { limit };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data.agents || [];
    } catch (error) {
      logger.debug(`Failed to fetch following for agent ${agentId}:`, error.message);
      return [];
    }
  }

  async makeRequest(method, url, config = {}) {
    this.requestCount++;
    
    const requestConfig = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'User-Agent': 'AgentIntelligenceHub/0.1.0',
        ...config.headers
      },
      timeout: 30000,
      ...config
    };

    const response = await axios(requestConfig);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return response;
  }

  async storePosts(posts) {
    if (!posts || posts.length === 0) return;

    await transaction(async (client) => {
      for (const post of posts) {
        // Ensure agent exists
        await this.upsertAgent(client, post.author, 'moltx');

        // Store post
        await client.query(`
          INSERT INTO posts (
            external_id, platform, title, content, url,
            upvotes, downvotes, comment_count, repost_count,
            agent_id, metadata, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
            (SELECT id FROM agents WHERE external_id = $10 AND platform = 'moltx'),
            $11, $12, NOW()
          )
          ON CONFLICT (platform, external_id)
          DO UPDATE SET
            upvotes = EXCLUDED.upvotes,
            downvotes = EXCLUDED.downvotes,
            comment_count = EXCLUDED.comment_count,
            repost_count = EXCLUDED.repost_count,
            updated_at = NOW()
        `, [
          post.id,
          'moltx',
          post.title || null,
          post.content,
          post.url || `https://moltx.io/posts/${post.id}`,
          post.likes || 0,
          post.dislikes || 0,
          post.reply_count || 0,
          post.repost_count || 0,
          post.author.id,
          JSON.stringify({
            author_handle: post.author.handle,
            author_avatar: post.author.avatar_url,
            hashtags: post.hashtags || [],
            mentions: post.mentions || [],
            media: post.media || [],
            quoted_post_id: post.quoted_post_id || null
          }),
          new Date(post.created_at)
        ]);
      }
    });

    logger.debug(`📝 Stored ${posts.length} Moltx posts`);
  }

  async storePostsWithEngagement(posts) {
    await this.storePosts(posts);

    // Track viral posts (>100 engagement)
    const viralPosts = posts.filter(p => 
      (p.likes || 0) + (p.reply_count || 0) + (p.repost_count || 0) > 100
    );

    if (viralPosts.length > 0) {
      logger.info(`🔥 ${viralPosts.length} viral Moltx posts detected`);
      
      // Store viral event
      await query(`
        INSERT INTO analytics_snapshots (snapshot_type, data)
        VALUES ('viral_posts_moltx', $1)
      `, [JSON.stringify({
        timestamp: new Date(),
        count: viralPosts.length,
        posts: viralPosts.map(p => ({
          id: p.id,
          author: p.author.handle,
          engagement: (p.likes || 0) + (p.reply_count || 0) + (p.repost_count || 0)
        }))
      })]);
    }
  }

  async storeAgentMetrics(agents) {
    if (!agents || agents.length === 0) return;

    await transaction(async (client) => {
      for (const agent of agents) {
        // Upsert agent
        await this.upsertAgent(client, agent, 'moltx');

        // Store/update metrics
        await client.query(`
          INSERT INTO agent_metrics (
            agent_id, platform, followers, following, posts_count,
            avg_engagement_rate, influence_score, collected_at
          )
          SELECT 
            id, $1, $2, $3, $4, $5, $6, NOW()
          FROM agents
          WHERE external_id = $7 AND platform = 'moltx'
          ON CONFLICT (agent_id, platform, collected_at)
          DO UPDATE SET
            followers = EXCLUDED.followers,
            following = EXCLUDED.following,
            posts_count = EXCLUDED.posts_count,
            avg_engagement_rate = EXCLUDED.avg_engagement_rate,
            influence_score = EXCLUDED.influence_score
        `, [
          'moltx',
          agent.followers || 0,
          agent.following || 0,
          agent.posts_count || 0,
          agent.avg_engagement_rate || 0,
          agent.influence_score || 0,
          agent.id
        ]);
      }
    });

    logger.debug(`📊 Stored metrics for ${agents.length} agents`);
  }

  async storeFollowingRelationships(agentId, followingAgents) {
    if (!followingAgents || followingAgents.length === 0) return;

    await transaction(async (client) => {
      // Delete old relationships for this agent
      await client.query(`
        DELETE FROM agent_relationships 
        WHERE source_agent_id = (
          SELECT id FROM agents WHERE external_id = $1 AND platform = 'moltx'
        )
        AND relationship_type = 'following'
      `, [agentId]);

      // Insert new relationships
      for (const targetAgent of followingAgents) {
        await this.upsertAgent(client, targetAgent, 'moltx');

        await client.query(`
          INSERT INTO agent_relationships (
            source_agent_id, target_agent_id, relationship_type, created_at
          )
          SELECT 
            (SELECT id FROM agents WHERE external_id = $1 AND platform = 'moltx'),
            (SELECT id FROM agents WHERE external_id = $2 AND platform = 'moltx'),
            'following',
            NOW()
          ON CONFLICT DO NOTHING
        `, [agentId, targetAgent.id]);
      }
    });

    logger.debug(`🔗 Stored ${followingAgents.length} following relationships`);
  }

  async upsertAgent(client, agent, platform) {
    const agentData = {
      name: agent.name || agent.handle,
      handle: agent.handle || null,
      avatar_url: agent.avatar_url || agent.avatar || null,
      bio: agent.bio || agent.description || null
    };

    await client.query(`
      INSERT INTO agents (
        name, platform, external_id, handle, avatar_url, bio, 
        metadata, first_seen, last_seen
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (external_id, platform)
      DO UPDATE SET
        handle = COALESCE(EXCLUDED.handle, agents.handle),
        avatar_url = COALESCE(EXCLUDED.avatar_url, agents.avatar_url),
        bio = COALESCE(EXCLUDED.bio, agents.bio),
        last_seen = NOW(),
        metadata = EXCLUDED.metadata
    `, [
      agentData.name,
      platform,
      agent.id,
      agentData.handle,
      agentData.avatar_url,
      agentData.bio,
      JSON.stringify(agentData)
    ]);
  }

  async updateEngagementMetrics() {
    // Calculate engagement trends
    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      SELECT 
        'engagement_metrics_moltx',
        json_build_object(
          'timestamp', NOW(),
          'total_posts_24h', (
            SELECT COUNT(*) FROM posts 
            WHERE platform = 'moltx' 
            AND created_at > NOW() - INTERVAL '24 hours'
          ),
          'total_engagement_24h', (
            SELECT COALESCE(SUM(upvotes + comment_count), 0) 
            FROM posts 
            WHERE platform = 'moltx' 
            AND created_at > NOW() - INTERVAL '24 hours'
          ),
          'top_agents_24h', (
            SELECT json_agg(json_build_object(
              'name', a.name,
              'engagement', SUM(p.upvotes + p.comment_count)
            ))
            FROM agents a
            JOIN posts p ON a.id = p.agent_id
            WHERE a.platform = 'moltx'
            AND p.created_at > NOW() - INTERVAL '24 hours'
            GROUP BY a.id
            ORDER BY SUM(p.upvotes + p.comment_count) DESC
            LIMIT 10
          )
        )
    `);

    logger.debug('📈 Updated engagement metrics');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      requestCount: this.requestCount,
      lastCollectionTime: this.lastCollectionTime
    };
  }
}

export default MoltxCollector;
