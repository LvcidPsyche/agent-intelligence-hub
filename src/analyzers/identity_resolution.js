import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';

/**
 * Identity Resolution System
 * Links agent accounts across platforms to build unified profiles
 * Uses heuristics: name similarity, metadata, following relationships, activity patterns
 */

class IdentityResolver {
  constructor() {
    this.similarityThreshold = 0.75; // 75% name similarity to match
    this.followingChainThreshold = 0.6; // 60% mutual following to confirm link
  }

  async resolveIdentities() {
    logger.info('🔗 Starting identity resolution...');
    const startTime = Date.now();

    try {
      // Phase 1: Link by exact name match
      await this.linkExactMatches();

      // Phase 2: Link by fuzzy name similarity
      await this.linkFuzzyMatches();

      // Phase 3: Link by following relationships (transitive)
      await this.linkByFollowingRelationships();

      // Phase 4: Link by bio/metadata similarity
      await this.linkByMetadata();

      // Phase 5: Detect and flag sock puppets
      await this.detectSockPuppets();

      // Create unified agent profiles
      await this.createUnifiedProfiles();

      const duration = Date.now() - startTime;
      logger.info(`✅ Identity resolution completed in ${duration}ms`);

      return await this.getResolutionStats();
    } catch (error) {
      logger.error('❌ Identity resolution failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Link accounts with identical names across platforms
   */
  async linkExactMatches() {
    logger.debug('Phase 1: Linking exact name matches...');

    const result = await query(`
      WITH agent_names AS (
        SELECT DISTINCT LOWER(name) as normalized_name
        FROM agents
        WHERE name IS NOT NULL AND name != ''
        GROUP BY LOWER(name)
        HAVING COUNT(DISTINCT platform) > 1
      )
      INSERT INTO agent_identity_links (primary_agent_id, linked_agent_id, link_type, confidence)
      SELECT 
        a1.id,
        a2.id,
        'exact_name_match',
        0.95
      FROM agents a1
      JOIN agents a2 ON LOWER(a1.name) = LOWER(a2.name)
      WHERE a1.id < a2.id  -- Avoid duplicates
      AND a1.platform != a2.platform
      AND NOT EXISTS (
        SELECT 1 FROM agent_identity_links
        WHERE (primary_agent_id = a1.id AND linked_agent_id = a2.id)
           OR (primary_agent_id = a2.id AND linked_agent_id = a1.id)
      )
      ON CONFLICT (primary_agent_id, linked_agent_id) 
      DO UPDATE SET confidence = GREATEST(EXCLUDED.confidence, agent_identity_links.confidence)
    `);

    logger.debug(`✅ Linked ${result.rowCount} exact name matches`);
  }

  /**
   * Phase 2: Link accounts by fuzzy name similarity
   * Uses Levenshtein distance for string matching
   */
  async linkFuzzyMatches() {
    logger.debug('Phase 2: Linking fuzzy name matches...');

    // Get all agent pairs from different platforms
    const agents = await query(`
      SELECT a1.id as agent1_id, a1.name as name1, a1.platform as platform1,
             a2.id as agent2_id, a2.name as name2, a2.platform as platform2
      FROM agents a1
      JOIN agents a2 ON a1.id < a2.id
      WHERE a1.platform != a2.platform
      AND a1.name IS NOT NULL AND a2.name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_identity_links
        WHERE (primary_agent_id = a1.id AND linked_agent_id = a2.id)
           OR (primary_agent_id = a2.id AND linked_agent_id = a1.id)
      )
      LIMIT 5000
    `);

    let linkedCount = 0;

    await transaction(async (client) => {
      for (const pair of agents.rows) {
        const similarity = this.stringSimilarity(pair.name1, pair.name2);

        if (similarity >= this.similarityThreshold) {
          await client.query(`
            INSERT INTO agent_identity_links (primary_agent_id, linked_agent_id, link_type, confidence)
            VALUES ($1, $2, 'fuzzy_name_match', $3)
            ON CONFLICT (primary_agent_id, linked_agent_id) 
            DO UPDATE SET confidence = GREATEST(EXCLUDED.confidence, $3)
          `, [pair.agent1_id, pair.agent2_id, similarity]);
          
          linkedCount++;
        }
      }
    });

    logger.debug(`✅ Linked ${linkedCount} fuzzy name matches`);
  }

  /**
   * Phase 3: Link accounts through following relationships
   * If agent A follows B on platform 1, and similar account B2 exists on platform 2,
   * and B follows B2 on platform 2, they're likely the same agent
   */
  async linkByFollowingRelationships() {
    logger.debug('Phase 3: Linking by following relationships...');

    // Find agents that follow each other with high probability of being same person
    const result = await query(`
      WITH potential_links AS (
        SELECT 
          a1.id as agent1_id, a1.platform as platform1,
          a2.id as agent2_id, a2.platform as platform2,
          COUNT(DISTINCT ar.target_agent_id) as mutual_follows
        FROM agents a1
        JOIN agents a2 ON a1.id != a2.id
        JOIN agent_relationships ar ON ar.source_agent_id = a1.id
        WHERE a1.platform != a2.platform
        AND ar.relationship_type = 'following'
        AND NOT EXISTS (
          SELECT 1 FROM agent_identity_links
          WHERE (primary_agent_id = a1.id AND linked_agent_id = a2.id)
             OR (primary_agent_id = a2.id AND linked_agent_id = a1.id)
        )
        GROUP BY a1.id, a2.id, a1.platform, a2.platform
        HAVING COUNT(DISTINCT ar.target_agent_id) >= 3
      )
      INSERT INTO agent_identity_links (primary_agent_id, linked_agent_id, link_type, confidence)
      SELECT agent1_id, agent2_id, 'following_pattern', 
             LEAST(0.85, (mutual_follows::float / 10))
      FROM potential_links
      WHERE mutual_follows >= 3
    `);

    logger.debug(`✅ Linked ${result.rowCount} accounts via following patterns`);
  }

  /**
   * Phase 4: Link by bio/metadata similarity
   */
  async linkByMetadata() {
    logger.debug('Phase 4: Linking by metadata similarity...');

    const agents = await query(`
      SELECT 
        a1.id as agent1_id, a1.platform as platform1, 
        a1.bio as bio1, a1.metadata as metadata1,
        a2.id as agent2_id, a2.platform as platform2,
        a2.bio as bio2, a2.metadata as metadata2
      FROM agents a1
      JOIN agents a2 ON a1.id < a2.id AND a1.platform != a2.platform
      WHERE a1.bio IS NOT NULL AND a2.bio IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM agent_identity_links
        WHERE (primary_agent_id = a1.id AND linked_agent_id = a2.id)
           OR (primary_agent_id = a2.id AND linked_agent_id = a1.id)
      )
      LIMIT 1000
    `);

    let linkedCount = 0;

    await transaction(async (client) => {
      for (const pair of agents.rows) {
        const bioSimilarity = this.stringSimilarity(pair.bio1 || '', pair.bio2 || '');
        
        // Also check for matching keywords in bio
        const bioMatch = this.bioKeywordMatch(pair.bio1, pair.bio2);

        const confidence = Math.max(bioSimilarity * 0.6, bioMatch);

        if (confidence > 0.65) {
          await client.query(`
            INSERT INTO agent_identity_links 
            (primary_agent_id, linked_agent_id, link_type, confidence)
            VALUES ($1, $2, 'bio_metadata_match', $3)
            ON CONFLICT (primary_agent_id, linked_agent_id) 
            DO UPDATE SET confidence = GREATEST(EXCLUDED.confidence, $3)
          `, [pair.agent1_id, pair.agent2_id, confidence]);
          
          linkedCount++;
        }
      }
    });

    logger.debug(`✅ Linked ${linkedCount} accounts via metadata`);
  }

  /**
   * Phase 5: Detect sock puppets and multi-account networks
   */
  async detectSockPuppets() {
    logger.debug('Phase 5: Detecting sock puppets...');

    // Find agents likely to be controlled by same entity
    const result = await query(`
      WITH network_clusters AS (
        SELECT 
          ARRAY_AGG(DISTINCT platform ORDER BY platform) as platforms,
          COUNT(*) as account_count,
          AVG(EXTRACT(EPOCH FROM created_at)) as avg_creation_time,
          STDDEV(EXTRACT(EPOCH FROM created_at)) as creation_time_variance,
          STRING_AGG(DISTINCT name, ', ') as names,
          STRING_AGG(DISTINCT external_id, ', ') as external_ids
        FROM agents
        WHERE id IN (
          SELECT primary_agent_id FROM agent_identity_links
          WHERE confidence >= 0.7
          UNION
          SELECT linked_agent_id FROM agent_identity_links
          WHERE confidence >= 0.7
        )
        GROUP BY 
          CASE 
            WHEN COUNT(DISTINCT platform) > 2 THEN 'multi_platform'
            WHEN ABS(EXTRACT(EPOCH FROM created_at) - 
                     AVG(EXTRACT(EPOCH FROM created_at)) OVER ()) < 86400 THEN 'cluster'
            ELSE 'single'
          END
      )
      INSERT INTO threat_alerts (alert_type, severity, description, data)
      SELECT 
        'sock_puppet_network',
        CASE 
          WHEN account_count >= 5 THEN 'high'
          WHEN account_count >= 3 THEN 'medium'
          ELSE 'low'
        END,
        'Potential sock puppet network detected: ' || STRING_AGG(names, ', '),
        JSON_BUILD_OBJECT(
          'account_count', account_count,
          'platforms', platforms,
          'creation_cluster', creation_time_variance < 86400
        )
      FROM network_clusters
      WHERE account_count >= 3
    `);

    logger.debug(`✅ Detected ${result.rowCount} potential sock puppet networks`);
  }

  /**
   * Create unified agent profiles from identity links
   */
  async createUnifiedProfiles() {
    logger.debug('Creating unified agent profiles...');

    // Use graph traversal to find connected components (agent clusters)
    const result = await query(`
      WITH RECURSIVE agent_clusters AS (
        -- Base case: single agents
        SELECT 
          id as root_agent_id,
          id as cluster_id,
          0 as depth
        FROM agents
        WHERE NOT EXISTS (
          SELECT 1 FROM agent_identity_links
          WHERE primary_agent_id = agents.id OR linked_agent_id = agents.id
        )

        UNION ALL

        -- Recursive case: follow identity links
        SELECT 
          ac.root_agent_id,
          COALESCE(ail.linked_agent_id, ail.primary_agent_id),
          ac.depth + 1
        FROM agent_clusters ac
        JOIN agent_identity_links ail ON 
          (ac.cluster_id = ail.primary_agent_id OR ac.cluster_id = ail.linked_agent_id)
        WHERE ac.depth < 10
      ),
      canonical_agents AS (
        SELECT 
          MIN(root_agent_id) as canonical_id,
          ARRAY_AGG(DISTINCT cluster_id) as linked_ids,
          COUNT(DISTINCT cluster_id) as cluster_size
        FROM agent_clusters
        GROUP BY 
          CASE WHEN root_agent_id = cluster_id THEN root_agent_id 
               ELSE LEAST(root_agent_id, cluster_id) END
        HAVING COUNT(DISTINCT cluster_id) > 1
      )
      INSERT INTO agent_unified_profiles 
      (primary_agent_id, linked_agent_ids, profile_type, created_at)
      SELECT 
        canonical_id,
        linked_ids,
        CASE 
          WHEN cluster_size >= 5 THEN 'network'
          WHEN cluster_size >= 3 THEN 'multi_account'
          ELSE 'linked'
        END,
        NOW()
      FROM canonical_agents
      ON CONFLICT (primary_agent_id) 
      DO UPDATE SET 
        linked_agent_ids = EXCLUDED.linked_agent_ids,
        updated_at = NOW()
    `);

    logger.debug(`✅ Created ${result.rowCount} unified profiles`);
  }

  /**
   * String similarity using Levenshtein distance (0-1 scale)
   */
  stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(s1, s2) {
    const track = Array(s2.length + 1).fill(null).map(() =>
      Array(s1.length + 1).fill(0)
    );

    for (let i = 0; i <= s1.length; i += 1) {
      track[0][i] = i;
    }
    for (let j = 0; j <= s2.length; j += 1) {
      track[j][0] = j;
    }

    for (let j = 1; j <= s2.length; j += 1) {
      for (let i = 1; i <= s1.length; i += 1) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }

    return track[s2.length][s1.length];
  }

  /**
   * Check for matching keywords in bios
   */
  bioKeywordMatch(bio1, bio2) {
    if (!bio1 || !bio2) return 0;

    const extractKeywords = (text) => {
      return text
        .toLowerCase()
        .match(/\b\w{4,}\b/g) || [];
    };

    const keywords1 = new Set(extractKeywords(bio1));
    const keywords2 = new Set(extractKeywords(bio2));

    const intersection = [...keywords1].filter(k => keywords2.has(k)).length;
    const union = new Set([...keywords1, ...keywords2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Get resolution statistics
   */
  async getResolutionStats() {
    const stats = await query(`
      SELECT 
        COUNT(DISTINCT primary_agent_id) as linked_agents,
        AVG(confidence) as avg_confidence,
        MAX(confidence) as max_confidence,
        MIN(confidence) as min_confidence
      FROM agent_identity_links
    `);

    return stats.rows[0] || {};
  }
}

export default IdentityResolver;
