import axios from 'axios';
import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';

const MOLTBOOK_BASE_URL = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY;

class MoltbookCollector {
  constructor() {
    this.isRunning = false;
    this.collectJob = null;
    this.requestCount = 0;
    this.lastCollectionTime = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Moltbook collector already running');
      return;
    }

    logger.info('🦞 Starting Moltbook collector...');
    
    // Run initial collection
    await this.collect();
    
    // Schedule regular collections every 15 minutes
    this.collectJob = new CronJob('*/15 * * * *', async () => {
      await this.collect();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ Moltbook collector started (15min intervals)');
  }

  async stop() {
    if (this.collectJob) {
      this.collectJob.stop();
      this.collectJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Moltbook collector stopped');
  }

  async collect() {
    try {
      logger.info('📡 Starting Moltbook collection cycle...');
      const startTime = Date.now();

      // Collect hot posts
      const hotPosts = await this.fetchPosts('hot', 50);
      await this.storePosts(hotPosts.posts);

      // Collect new posts
      const newPosts = await this.fetchPosts('new', 25);
      await this.storeNewPosts(newPosts.posts);

      // Collect submolt data
      const submolts = await this.fetchSubmolts();
      await this.analyzeSubmoltTrends(submolts.submolts);

      // Update agent activity
      await this.updateAgentActivity();

      const duration = Date.now() - startTime;
      this.lastCollectionTime = new Date();

      logger.info(`✅ Moltbook collection completed in ${duration}ms`, {
        hotPosts: hotPosts.posts.length,
        newPosts: newPosts.posts.length,
        submolts: submolts.submolts.length,
        totalRequests: this.requestCount
      });

    } catch (error) {
      logger.error('❌ Moltbook collection failed:', error);
    }
  }

  async fetchPosts(sort = 'hot', limit = 25) {
    const url = `${MOLTBOOK_BASE_URL}/posts`;
    const params = { sort, limit };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch ${sort} posts:`, error.message);
      throw error;
    }
  }

  async fetchSubmolts() {
    const url = `${MOLTBOOK_BASE_URL}/submolts`;

    try {
      const response = await this.makeRequest('GET', url);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch submolts:', error.message);
      throw error;
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
    
    // Add rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return response;
  }

  async storePosts(posts) {
    if (!posts || posts.length === 0) return;

    await transaction(async (client) => {
      for (const post of posts) {
        // First ensure agent exists
        await this.upsertAgent(client, post.author, 'moltbook');

        // Then store/update post
        await client.query(`
          INSERT INTO posts (
            external_id, platform, title, content, url, 
            upvotes, downvotes, comment_count, submolt,
            agent_id, metadata, created_at, updated_at
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 
            (SELECT id FROM agents WHERE name = $10 AND platform = 'moltbook'),
            $11, $12, NOW()
          )
          ON CONFLICT (platform, external_id) 
          DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            upvotes = EXCLUDED.upvotes,
            downvotes = EXCLUDED.downvotes,
            comment_count = EXCLUDED.comment_count,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          post.id,
          'moltbook',
          post.title,
          post.content,
          post.url,
          post.upvotes || 0,
          post.downvotes || 0,
          post.comment_count || 0,
          post.submolt?.name || 'general',
          post.author.name,
          JSON.stringify({
            submolt_display_name: post.submolt?.display_name,
            created_at: post.created_at,
            external_author_id: post.author.id
          }),
          new Date(post.created_at)
        ]);
      }
    });

    logger.debug(`📝 Stored ${posts.length} posts`);
  }

  async storeNewPosts(posts) {
    // Same as storePosts but track as new content
    await this.storePosts(posts);
    
    // Additional analysis for new posts
    const highEngagementPosts = posts.filter(p => 
      (p.upvotes || 0) > 100 || (p.comment_count || 0) > 10
    );

    if (highEngagementPosts.length > 0) {
      logger.info(`🔥 ${highEngagementPosts.length} high-engagement new posts detected`);
    }
  }

  async upsertAgent(client, author, platform) {
    await client.query(`
      INSERT INTO agents (name, platform, external_id, metadata, first_seen, last_seen)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (name, platform)
      DO UPDATE SET
        last_seen = NOW(),
        metadata = EXCLUDED.metadata
    `, [
      author.name,
      platform,
      author.id,
      JSON.stringify(author)
    ]);
  }

  async analyzeSubmoltTrends(submolts) {
    const trends = {
      total_submolts: submolts.length,
      top_by_subscribers: submolts
        .sort((a, b) => b.subscriber_count - a.subscriber_count)
        .slice(0, 10)
        .map(s => ({
          name: s.name,
          display_name: s.display_name,
          subscribers: s.subscriber_count,
          last_activity: s.last_activity_at
        })),
      recently_active: submolts
        .filter(s => s.last_activity_at)
        .sort((a, b) => new Date(b.last_activity_at) - new Date(a.last_activity_at))
        .slice(0, 10)
        .map(s => ({
          name: s.name,
          display_name: s.display_name,
          last_activity: s.last_activity_at
        }))
    };

    // Store analytics snapshot
    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('submolt_trends', $1)
    `, [JSON.stringify(trends)]);

    logger.debug(`📊 Analyzed ${submolts.length} submolts`);
  }

  async updateAgentActivity() {
    // Update agent reputation scores based on recent activity
    await query(`
      UPDATE agents SET 
        reputation_score = (
          SELECT COALESCE(SUM(upvotes - downvotes), 0)
          FROM posts 
          WHERE posts.agent_id = agents.id 
          AND posts.created_at > NOW() - INTERVAL '7 days'
        ),
        updated_at = NOW()
      WHERE platform = 'moltbook'
    `);

    logger.debug('📈 Updated agent reputation scores');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      requestCount: this.requestCount,
      lastCollectionTime: this.lastCollectionTime
    };
  }
}

export default MoltbookCollector;