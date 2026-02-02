import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';

/**
 * Reputation Engine
 * Calculates multi-factor reputation scores for agents across platforms
 * Factors: Activity, Engagement, Community Trust, Security Record, Longevity
 */

class ReputationEngine {
  constructor() {
    this.weights = {
      moltbook_activity: 0.20,
      moltx_influence: 0.20,
      engagement_quality: 0.25,
      security_record: 0.20,
      longevity: 0.15
    };
  }

  async calculateReputation() {
    logger.info('🏆 Starting reputation calculation...');
    const startTime = Date.now();

    try {
      // Phase 1: Calculate platform-specific scores
      await this.calculateMoltbookScore();
      await this.calculateMoltxScore();
      await this.calculate4clawScore();

      // Phase 2: Calculate cross-cutting factors
      await this.calculateEngagementQuality();
      await this.calculateSecurityScore();
      await this.calculateLongevityScore();

      // Phase 3: Combine into composite score
      await this.calculateCompositeScore();

      // Phase 4: Generate leaderboards
      await this.generateLeaderboards();

      const duration = Date.now() - startTime;
      logger.info(`✅ Reputation calculation completed in ${duration}ms`);

      return await this.getReputationStats();
    } catch (error) {
      logger.error('❌ Reputation calculation failed:', error);
      throw error;
    }
  }

  /**
   * Moltbook Score (0-100)
   * Factors: Karma, activity consistency, post quality
   */
  async calculateMoltbookScore() {
    logger.debug('Calculating Moltbook scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        'moltbook',
        LEAST(100, GREATEST(0,
          -- Karma base (0-30 points)
          (COALESCE(NULLIF(am.reputation_score, 0), 0) / 1000) * 30 +
          -- Activity consistency (0-30 points)
          CASE 
            WHEN COUNT(p.id) > 100 THEN 30
            WHEN COUNT(p.id) > 50 THEN 25
            WHEN COUNT(p.id) > 20 THEN 20
            WHEN COUNT(p.id) > 5 THEN 10
            ELSE 0
          END +
          -- Engagement ratio (0-25 points)
          LEAST(25, GREATEST(0, 
            AVG(COALESCE(p.upvotes, 0)) / 5
          )) +
          -- Consistency bonus (0-15 points)
          CASE 
            WHEN EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) > 86400 * 30 THEN 15
            WHEN EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) > 86400 * 7 THEN 10
            WHEN EXTRACT(EPOCH FROM (MAX(p.created_at) - MIN(p.created_at))) > 86400 THEN 5
            ELSE 0
          END
        )),
        JSON_BUILD_OBJECT(
          'karma_score', COALESCE(NULLIF(am.reputation_score, 0), 0),
          'post_count', COUNT(p.id),
          'avg_engagement', AVG(COALESCE(p.upvotes, 0)),
          'posting_days', EXTRACT(DAY FROM (MAX(p.created_at) - MIN(p.created_at)))
        )
      FROM agents a
      LEFT JOIN agent_metrics am ON a.id = am.agent_id AND am.platform = 'moltbook'
      LEFT JOIN posts p ON a.id = p.agent_id AND p.platform = 'moltbook'
      WHERE a.platform IN ('moltbook', 'unified')
      GROUP BY a.id, am.reputation_score
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Moltbook scores calculated');
  }

  /**
   * Moltx Score (0-100)
   * Factors: Followers, engagement rate, influence
   */
  async calculateMoltxScore() {
    logger.debug('Calculating Moltx scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        'moltx',
        LEAST(100, GREATEST(0,
          -- Follower base (0-40 points)
          CASE 
            WHEN am.followers > 10000 THEN 40
            WHEN am.followers > 5000 THEN 35
            WHEN am.followers > 1000 THEN 30
            WHEN am.followers > 100 THEN 20
            WHEN am.followers > 0 THEN 10
            ELSE 0
          END +
          -- Engagement rate (0-35 points)
          LEAST(35, GREATEST(0,
            COALESCE(am.avg_engagement_rate, 0) * 3.5
          )) +
          -- Consistency (0-15 points)
          CASE 
            WHEN am.posts_count > 1000 THEN 15
            WHEN am.posts_count > 500 THEN 12
            WHEN am.posts_count > 100 THEN 10
            WHEN am.posts_count > 20 THEN 5
            ELSE 0
          END +
          -- Influence score bonus (0-10 points)
          LEAST(10, GREATEST(0, COALESCE(am.influence_score, 0)))
        )),
        JSON_BUILD_OBJECT(
          'followers', COALESCE(am.followers, 0),
          'following', COALESCE(am.following, 0),
          'posts_count', COALESCE(am.posts_count, 0),
          'avg_engagement_rate', COALESCE(am.avg_engagement_rate, 0),
          'influence_score', COALESCE(am.influence_score, 0)
        )
      FROM agents a
      LEFT JOIN agent_metrics am ON a.id = am.agent_id AND am.platform = 'moltx'
      WHERE a.platform IN ('moltx', 'unified')
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Moltx scores calculated');
  }

  /**
   * 4claw Score (0-100)
   * Factors: Post quality, community standing, consistency
   */
  async calculate4clawScore() {
    logger.debug('Calculating 4claw scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        '4claw',
        LEAST(100, GREATEST(0,
          -- Post count and quality (0-40 points)
          CASE 
            WHEN COUNT(p.id) > 500 THEN 40
            WHEN COUNT(p.id) > 100 THEN 35
            WHEN COUNT(p.id) > 20 THEN 25
            WHEN COUNT(p.id) > 0 THEN 10
            ELSE 0
          END +
          -- Engagement (0-30 points)
          LEAST(30, GREATEST(0, 
            AVG(COALESCE(p.upvotes, 0) + COALESCE(p.comment_count, 0)) / 2
          )) +
          -- Sentiment score (0-20 points)
          CASE 
            WHEN AVG(CASE WHEN p.metadata->>'sentiment' = 'positive' THEN 1 ELSE 0 END) > 0.7 THEN 20
            WHEN AVG(CASE WHEN p.metadata->>'sentiment' = 'positive' THEN 1 ELSE 0 END) > 0.5 THEN 15
            WHEN AVG(CASE WHEN p.metadata->>'sentiment' = 'negative' THEN 1 ELSE 0 END) > 0.5 THEN 0
            ELSE 10
          END +
          -- Consistency (0-10 points)
          CASE 
            WHEN COUNT(DISTINCT DATE(p.created_at)) > 30 THEN 10
            WHEN COUNT(DISTINCT DATE(p.created_at)) > 10 THEN 7
            ELSE 0
          END
        )),
        JSON_BUILD_OBJECT(
          'post_count', COUNT(p.id),
          'avg_engagement', AVG(COALESCE(p.upvotes, 0) + COALESCE(p.comment_count, 0)),
          'positive_sentiment_pct', 
            ROUND(100 * AVG(CASE WHEN p.metadata->>'sentiment' = 'positive' THEN 1 ELSE 0 END)::numeric, 2),
          'active_days', COUNT(DISTINCT DATE(p.created_at))
        )
      FROM agents a
      LEFT JOIN posts p ON a.id = p.agent_id AND p.platform = '4claw'
      GROUP BY a.id
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ 4claw scores calculated');
  }

  /**
   * Engagement Quality (0-100)
   * Measures thoughtfulness vs. spam
   */
  async calculateEngagementQuality() {
    logger.debug('Calculating engagement quality scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        'engagement_quality',
        LEAST(100, GREATEST(0,
          -- Avg post length (0-25 points)
          CASE 
            WHEN AVG(LENGTH(COALESCE(p.content, ''))) > 500 THEN 25
            WHEN AVG(LENGTH(COALESCE(p.content, ''))) > 200 THEN 20
            WHEN AVG(LENGTH(COALESCE(p.content, ''))) > 50 THEN 15
            ELSE 5
          END +
          -- Engagement-to-post ratio (0-35 points)
          LEAST(35, GREATEST(0,
            (SUM(COALESCE(p.upvotes, 0) + COALESCE(p.comment_count, 0))::float / 
            NULLIF(COUNT(p.id), 0)) * 2
          )) +
          -- Cross-platform consistency (0-20 points)
          CASE 
            WHEN COUNT(DISTINCT p.platform) >= 3 THEN 20
            WHEN COUNT(DISTINCT p.platform) = 2 THEN 10
            ELSE 0
          END +
          -- Sentiment consistency (0-20 points)
          CASE 
            WHEN STDDEV(CASE WHEN p.metadata->>'sentiment' = 'positive' THEN 1 ELSE 0 END) < 0.3 THEN 20
            WHEN STDDEV(CASE WHEN p.metadata->>'sentiment' = 'positive' THEN 1 ELSE 0 END) < 0.4 THEN 10
            ELSE 0
          END
        )),
        JSON_BUILD_OBJECT(
          'avg_post_length', ROUND(AVG(LENGTH(COALESCE(p.content, '')))::numeric, 0),
          'total_posts', COUNT(p.id),
          'avg_engagement_per_post', 
            ROUND((SUM(COALESCE(p.upvotes, 0) + COALESCE(p.comment_count, 0))::float / 
                   NULLIF(COUNT(p.id), 0))::numeric, 2),
          'platforms', COUNT(DISTINCT p.platform)
        )
      FROM agents a
      LEFT JOIN posts p ON a.id = p.agent_id
      GROUP BY a.id
      HAVING COUNT(p.id) > 0
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Engagement quality scores calculated');
  }

  /**
   * Security Score (0-100)
   * No scams, audits passed, clean record
   */
  async calculateSecurityScore() {
    logger.debug('Calculating security scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        'security_record',
        LEAST(100, GREATEST(0,
          -- Base score (100 if no threats)
          CASE 
            WHEN COUNT(ta.id) = 0 THEN 100
            ELSE MAX(CASE WHEN ta.severity = 'critical' THEN 0 WHEN ta.severity = 'high' THEN 20 ELSE 40 END)
          END -
          -- Threat penalties
          (COUNT(CASE WHEN ta.severity = 'critical' THEN 1 END) * 30) -
          (COUNT(CASE WHEN ta.severity = 'high' THEN 1 END) * 15) -
          (COUNT(CASE WHEN ta.severity = 'medium' THEN 1 END) * 5)
        )),
        JSON_BUILD_OBJECT(
          'threat_count', COUNT(ta.id),
          'critical_threats', COUNT(CASE WHEN ta.severity = 'critical' THEN 1 END),
          'high_threats', COUNT(CASE WHEN ta.severity = 'high' THEN 1 END),
          'clean_record', CASE WHEN COUNT(ta.id) = 0 THEN true ELSE false END,
          'last_threat', MAX(ta.created_at)
        )
      FROM agents a
      LEFT JOIN threat_alerts ta ON 
        (a.id = ta.agent_id OR a.external_id = ta.data->>'agent_id')
        AND ta.created_at > NOW() - INTERVAL '90 days'
      GROUP BY a.id
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Security scores calculated');
  }

  /**
   * Longevity Score (0-100)
   * Account age and consistency over time
   */
  async calculateLongevityScore() {
    logger.debug('Calculating longevity scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        a.id,
        'longevity',
        LEAST(100, GREATEST(0,
          -- Account age (0-40 points)
          CASE 
            WHEN EXTRACT(DAY FROM (NOW() - a.first_seen)) > 365 THEN 40
            WHEN EXTRACT(DAY FROM (NOW() - a.first_seen)) > 180 THEN 30
            WHEN EXTRACT(DAY FROM (NOW() - a.first_seen)) > 60 THEN 20
            WHEN EXTRACT(DAY FROM (NOW() - a.first_seen)) > 30 THEN 10
            ELSE 0
          END +
          -- Activity consistency (0-30 points)
          CASE 
            WHEN (EXTRACT(DAY FROM (a.last_seen - a.first_seen)) / 
                  NULLIF(EXTRACT(DAY FROM (NOW() - a.first_seen)), 0)) > 0.8 THEN 30
            WHEN (EXTRACT(DAY FROM (a.last_seen - a.first_seen)) / 
                  NULLIF(EXTRACT(DAY FROM (NOW() - a.first_seen)), 0)) > 0.5 THEN 20
            WHEN (EXTRACT(DAY FROM (a.last_seen - a.first_seen)) / 
                  NULLIF(EXTRACT(DAY FROM (NOW() - a.first_seen)), 0)) > 0.2 THEN 10
            ELSE 0
          END +
          -- Last activity recency (0-30 points)
          CASE 
            WHEN EXTRACT(DAY FROM (NOW() - a.last_seen)) < 7 THEN 30
            WHEN EXTRACT(DAY FROM (NOW() - a.last_seen)) < 14 THEN 25
            WHEN EXTRACT(DAY FROM (NOW() - a.last_seen)) < 30 THEN 20
            WHEN EXTRACT(DAY FROM (NOW() - a.last_seen)) < 90 THEN 10
            ELSE 0
          END
        )),
        JSON_BUILD_OBJECT(
          'account_age_days', EXTRACT(DAY FROM (NOW() - a.first_seen)),
          'activity_span_days', EXTRACT(DAY FROM (a.last_seen - a.first_seen)),
          'consistency_ratio', 
            ROUND(((EXTRACT(DAY FROM (a.last_seen - a.first_seen)) / 
                    NULLIF(EXTRACT(DAY FROM (NOW() - a.first_seen)), 0))::numeric) * 100, 2),
          'days_since_activity', EXTRACT(DAY FROM (NOW() - a.last_seen))
        )
      FROM agents a
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Longevity scores calculated');
  }

  /**
   * Composite Score (0-100)
   * Weighted average of all factors
   */
  async calculateCompositeScore() {
    logger.debug('Calculating composite scores...');

    await query(`
      INSERT INTO agent_reputation_scores (agent_id, platform, score, factor_breakdown)
      SELECT 
        COALESCE(mb.agent_id, mx.agent_id, cc.agent_id, eq.agent_id, sec.agent_id, lg.agent_id),
        'composite',
        LEAST(100, GREATEST(0,
          COALESCE(mb.score, 0) * 0.20 +
          COALESCE(mx.score, 0) * 0.20 +
          COALESCE(cc.score, 0) * 0.10 +
          COALESCE(eq.score, 0) * 0.25 +
          COALESCE(sec.score, 0) * 0.20 +
          COALESCE(lg.score, 0) * 0.05
        )),
        JSON_BUILD_OBJECT(
          'moltbook', COALESCE(mb.score, 0),
          'moltx', COALESCE(mx.score, 0),
          '4claw', COALESCE(cc.score, 0),
          'engagement_quality', COALESCE(eq.score, 0),
          'security', COALESCE(sec.score, 0),
          'longevity', COALESCE(lg.score, 0)
        )
      FROM (SELECT * FROM agent_reputation_scores WHERE platform = 'moltbook') mb
      FULL OUTER JOIN (SELECT * FROM agent_reputation_scores WHERE platform = 'moltx') mx
        ON mb.agent_id = mx.agent_id
      FULL OUTER JOIN (SELECT * FROM agent_reputation_scores WHERE platform = '4claw') cc
        ON COALESCE(mb.agent_id, mx.agent_id) = cc.agent_id
      FULL OUTER JOIN (SELECT * FROM agent_reputation_scores WHERE platform = 'engagement_quality') eq
        ON COALESCE(mb.agent_id, mx.agent_id, cc.agent_id) = eq.agent_id
      FULL OUTER JOIN (SELECT * FROM agent_reputation_scores WHERE platform = 'security_record') sec
        ON COALESCE(mb.agent_id, mx.agent_id, cc.agent_id, eq.agent_id) = sec.agent_id
      FULL OUTER JOIN (SELECT * FROM agent_reputation_scores WHERE platform = 'longevity') lg
        ON COALESCE(mb.agent_id, mx.agent_id, cc.agent_id, eq.agent_id, sec.agent_id) = lg.agent_id
      ON CONFLICT (agent_id, platform) 
      DO UPDATE SET 
        score = EXCLUDED.score,
        factor_breakdown = EXCLUDED.factor_breakdown,
        updated_at = NOW()
    `);

    logger.debug('✅ Composite scores calculated');
  }

  /**
   * Generate leaderboards
   */
  async generateLeaderboards() {
    logger.debug('Generating leaderboards...');

    // Top 100 by composite score
    const topAgents = await query(`
      SELECT 
        a.id, a.name, a.platform,
        ars.score,
        ars.factor_breakdown,
        ROW_NUMBER() OVER (ORDER BY ars.score DESC) as rank
      FROM agents a
      JOIN agent_reputation_scores ars ON a.id = ars.agent_id
      WHERE ars.platform = 'composite'
      ORDER BY ars.score DESC
      LIMIT 100
    `);

    // Store leaderboard snapshot
    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('leaderboard_top100', $1)
    `, [JSON.stringify({
      timestamp: new Date(),
      leaderboard: topAgents.rows
    })]);

    logger.debug(`✅ Generated leaderboards (top ${topAgents.rowCount})`);
  }

  /**
   * Get reputation statistics
   */
  async getReputationStats() {
    const stats = await query(`
      SELECT 
        platform,
        COUNT(*) as agent_count,
        ROUND(AVG(score)::numeric, 2) as avg_score,
        MAX(score) as max_score,
        MIN(score) as min_score,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score
      FROM agent_reputation_scores
      GROUP BY platform
      ORDER BY platform DESC
    `);

    return stats.rows;
  }
}

export default ReputationEngine;
