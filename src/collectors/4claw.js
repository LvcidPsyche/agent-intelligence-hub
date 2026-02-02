import axios from 'axios';
import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';

const CLAWCHAN_BASE_URL = 'https://api.4claw.io/api/v1';
const API_KEY = process.env.CLAWCHAN_API_KEY;

// Boards to monitor
const MONITORED_BOARDS = [
  'singularity',  // AI singularity, AGI discussions
  'ai',           // General AI development
  'tech',         // Technology news
  'marketplace',  // Token launches, trading
  'agents',       // Agent ecosystem
  'operations',   // Automation, infrastructure
  'chaos'         // Memes, culture
];

class ClawhCanCollector {
  constructor() {
    this.isRunning = false;
    this.collectJob = null;
    this.requestCount = 0;
    this.lastCollectionTime = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('4claw collector already running');
      return;
    }

    logger.info('📋 Starting 4claw collector...');
    
    // Run initial collection
    await this.collect();
    
    // Schedule regular collections every 12 minutes
    this.collectJob = new CronJob('*/12 * * * *', async () => {
      await this.collect();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ 4claw collector started (12min intervals)');
  }

  async stop() {
    if (this.collectJob) {
      this.collectJob.stop();
      this.collectJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 4claw collector stopped');
  }

  async collect() {
    try {
      logger.info('📡 Starting 4claw collection cycle...');
      const startTime = Date.now();

      let totalThreads = 0;
      let totalPosts = 0;

      // Collect from each board
      for (const board of MONITORED_BOARDS) {
        try {
          const threads = await this.fetchRecentThreads(board, 30);
          totalThreads += threads.length;

          // Collect replies for each thread
          for (const thread of threads) {
            const posts = await this.fetchThreadPosts(board, thread.id, 50);
            totalPosts += posts.length;
            
            await this.storeThread(board, thread, posts);
          }
        } catch (error) {
          logger.warn(`Failed to collect ${board} board:`, error.message);
        }
      }

      // Analyze sentiment & detect trends
      await this.analyzeTrends();

      // Update board activity metrics
      await this.updateBoardMetrics();

      const duration = Date.now() - startTime;
      this.lastCollectionTime = new Date();

      logger.info(`✅ 4claw collection completed in ${duration}ms`, {
        threads: totalThreads,
        posts: totalPosts,
        boards: MONITORED_BOARDS.length,
        totalRequests: this.requestCount
      });

    } catch (error) {
      logger.error('❌ 4claw collection failed:', error);
    }
  }

  async fetchRecentThreads(board, limit = 30) {
    const url = `${CLAWCHAN_BASE_URL}/boards/${board}/threads`;
    const params = { 
      limit,
      sort: 'bump',
      page: 0
    };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data.threads || [];
    } catch (error) {
      logger.error(`Failed to fetch threads from /${board}/:`, error.message);
      throw error;
    }
  }

  async fetchThreadPosts(board, threadId, limit = 50) {
    const url = `${CLAWCHAN_BASE_URL}/boards/${board}/threads/${threadId}`;
    const params = { limit };

    try {
      const response = await this.makeRequest('GET', url, { params });
      return response.data.posts || [];
    } catch (error) {
      logger.error(`Failed to fetch posts for thread ${threadId}:`, error.message);
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
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return response;
  }

  async storeThread(board, thread, posts) {
    if (!posts || posts.length === 0) return;

    await transaction(async (client) => {
      // Ensure board exists
      await client.query(`
        INSERT INTO platforms (name, type)
        VALUES ($1, 'imageboard')
        ON CONFLICT (name) DO NOTHING
      `, [`4claw/${board}`]);

      // Ensure OP (original poster) exists
      const opAuthor = thread.author || posts[0]?.author || 'Anonymous';
      await this.upsertCommunityMember(client, opAuthor, '4claw');

      // Store thread as post
      const threadEngagement = posts.reduce((sum, p) => 
        sum + (p.replies || 0) + (p.bumps || 0), 0
      );

      await client.query(`
        INSERT INTO posts (
          external_id, platform, title, content, url,
          upvotes, comment_count, repost_count,
          agent_id, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
          (SELECT id FROM community_members WHERE username = $9),
          $10, $11, NOW()
        )
        ON CONFLICT (platform, external_id)
        DO UPDATE SET
          comment_count = EXCLUDED.comment_count,
          upvotes = EXCLUDED.upvotes,
          updated_at = NOW()
      `, [
        `${board}-${thread.id}`,
        '4claw',
        thread.title || `/${board}/ thread ${thread.id}`,
        thread.content,
        `https://4claw.io/${board}/thread/${thread.id}`,
        thread.bumps || 0,
        posts.length,
        threadEngagement,
        opAuthor,
        JSON.stringify({
          board,
          thread_id: thread.id,
          reply_count: posts.length,
          bump_count: thread.bumps || 0,
          image_count: posts.filter(p => p.image).length,
          op_post_id: thread.id
        }),
        new Date(thread.created_at)
      ]);

      // Store individual posts
      for (const post of posts) {
        const author = post.author || 'Anonymous';
        
        // Ensure member exists
        await this.upsertCommunityMember(client, author, '4claw');

        // Extract sentiment keywords
        const content = post.content || '';
        const sentiment = this.analyzeSentiment(content);
        const keywords = this.extractKeywords(content);

        await client.query(`
          INSERT INTO posts (
            external_id, platform, content, url,
            upvotes, comment_count,
            agent_id, metadata, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6,
            (SELECT id FROM community_members WHERE username = $7),
            $8, $9, NOW()
          )
          ON CONFLICT (platform, external_id) DO NOTHING
        `, [
          `${board}-${thread.id}-${post.id}`,
          '4claw',
          content,
          `https://4claw.io/${board}/thread/${thread.id}#${post.id}`,
          post.likes || 0,
          post.replies || 0,
          author,
          JSON.stringify({
            board,
            thread_id: thread.id,
            post_id: post.id,
            sentiment,
            keywords,
            image: post.image || null,
            is_op: post.is_op || false
          }),
          new Date(post.created_at)
        ]);
      }
    });

    logger.debug(`📝 Stored thread ${thread.id} from /${board}/ (${posts.length} posts)`);
  }

  async upsertCommunityMember(client, username, platform) {
    // For 4claw, members can be anonymous or named
    if (username === 'Anonymous' || username === 'Anon') {
      return; // Don't track anonymous users
    }

    await client.query(`
      INSERT INTO community_members (username, platform, metadata, first_seen, last_seen)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (username, platform)
      DO UPDATE SET
        last_seen = NOW()
    `, [
      username,
      platform,
      JSON.stringify({ username })
    ]);
  }

  analyzeSentiment(text) {
    if (!text) return 'neutral';

    const lowerText = text.toLowerCase();
    
    // Simple sentiment analysis
    const positiveWords = ['bullish', 'moon', 'based', 'based af', 'based and red-pilled', 'kek', 'genius', 'brilliant', 'winning'];
    const negativeWords = ['bearish', 'rug', 'scam', 'cope', 'seethe', 'disaster', 'stupid', 'idiotic', 'fud'];
    
    const posScore = positiveWords.filter(w => lowerText.includes(w)).length;
    const negScore = negativeWords.filter(w => lowerText.includes(w)).length;

    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }

  extractKeywords(text) {
    if (!text) return [];

    // Extract mentioned tokens, agents, topics
    const keywords = [];

    // Detect token tickers ($SYMBOL)
    const tokenMatch = text.match(/\$[A-Z]{2,10}/g) || [];
    keywords.push(...tokenMatch);

    // Detect @mentions
    const mentions = text.match(/@[a-zA-Z0-9_]+/g) || [];
    keywords.push(...mentions);

    // Detect URLs
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    keywords.push(...urls);

    // Common topic keywords
    const topics = text.match(/\b(AGI|singularity|ethereum|bitcoin|crypto|defi|web3|meme|rug|audit|security|based|cope|fud|AI)\b/gi) || [];
    keywords.push(...topics);

    return [...new Set(keywords)]; // Deduplicate
  }

  async analyzeTrends() {
    // Extract trending topics from recent posts
    const trendingKeywords = await query(`
      SELECT 
        (metadata->>'keywords')::jsonb as keyword,
        COUNT(*) as count
      FROM posts
      WHERE platform = '4claw'
      AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 20
    `);

    // Count sentiment by board
    const boardSentiment = await query(`
      SELECT 
        (metadata->>'board') as board,
        (metadata->>'sentiment') as sentiment,
        COUNT(*) as count
      FROM posts
      WHERE platform = '4claw'
      AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY board, sentiment
      ORDER BY board, count DESC
    `);

    const trendAnalysis = {
      timestamp: new Date(),
      trending_keywords: trendingKeywords.rows,
      board_sentiment: boardSentiment.rows,
      platforms_monitored: MONITORED_BOARDS
    };

    // Store trend snapshot
    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('trends_4claw', $1)
    `, [JSON.stringify(trendAnalysis)]);

    logger.debug('📊 Analyzed 4claw trends');
  }

  async updateBoardMetrics() {
    // Get metrics per board
    const boardStats = await query(`
      SELECT
        (metadata->>'board') as board,
        COUNT(*) as post_count,
        SUM((upvotes)::int) as total_upvotes,
        AVG((comment_count)::int) as avg_replies,
        MAX(created_at) as last_activity
      FROM posts
      WHERE platform = '4claw'
      AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY board
      ORDER BY post_count DESC
    `);

    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('board_metrics_4claw', $1)
    `, [JSON.stringify({
      timestamp: new Date(),
      boards: boardStats.rows
    })]);

    logger.debug('📈 Updated board metrics');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      requestCount: this.requestCount,
      lastCollectionTime: this.lastCollectionTime,
      boardsMonitored: MONITORED_BOARDS.length
    };
  }
}

export default ClawhCanCollector;
