import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query } from '../utils/database.js';

class ThreatIntelligenceAnalyzer {
  constructor() {
    this.isRunning = false;
    this.analysisJob = null;
    this.threatPatterns = new Map();
    this.behaviorBaselines = new Map();
    this.riskModels = this.initializeRiskModels();
  }

  initializeRiskModels() {
    return {
      // Agent behavior risk scoring
      agentBehavior: {
        suspiciousPatterns: [
          'rapid_skill_creation', // Creating many skills quickly
          'credential_harvesting', // Skills that collect API keys
          'network_scanning', // Skills that probe external services
          'data_exfiltration', // Skills that send data externally
          'privilege_escalation', // Skills that attempt to gain elevated access
          'social_engineering' // Skills designed to manipulate users
        ],
        riskWeights: {
          rapid_skill_creation: 0.6,
          credential_harvesting: 0.9,
          network_scanning: 0.7,
          data_exfiltration: 0.8,
          privilege_escalation: 0.9,
          social_engineering: 0.8
        }
      },
      
      // Skill supply chain risks
      supplyChain: {
        riskFactors: [
          'unverified_author',
          'suspicious_dependencies', 
          'recent_account_creation',
          'unusual_update_pattern',
          'high_privilege_requests',
          'obfuscated_code'
        ],
        riskWeights: {
          unverified_author: 0.4,
          suspicious_dependencies: 0.7,
          recent_account_creation: 0.5,
          unusual_update_pattern: 0.6,
          high_privilege_requests: 0.8,
          obfuscated_code: 0.9
        }
      },

      // Network-based threat detection
      networkThreats: {
        indicators: [
          'coordinated_behavior', // Multiple agents with similar patterns
          'botnet_signatures', // Signs of automated coordination
          'influence_campaigns', // Attempts to manipulate community sentiment
          'reputation_manipulation', // Fake engagement or reviews
          'market_manipulation' // Coordinated token/economic activity
        ],
        weights: {
          coordinated_behavior: 0.7,
          botnet_signatures: 0.9,
          influence_campaigns: 0.6,
          reputation_manipulation: 0.5,
          market_manipulation: 0.8
        }
      }
    };
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Threat Intelligence analyzer already running');
      return;
    }

    logger.info('🕵️ Starting Threat Intelligence analyzer...');
    
    // Run initial analysis
    await this.analyze();
    
    // Schedule regular analysis every 2 hours
    this.analysisJob = new CronJob('0 */2 * * *', async () => {
      await this.analyze();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ Threat Intelligence analyzer started (2hr intervals)');
  }

  async stop() {
    if (this.analysisJob) {
      this.analysisJob.stop();
      this.analysisJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Threat Intelligence analyzer stopped');
  }

  async analyze() {
    try {
      logger.info('🕵️ Starting threat intelligence analysis...');
      const startTime = Date.now();

      // Multi-layer threat analysis
      const agentBehaviorThreats = await this.analyzeAgentBehavior();
      const supplyChainThreats = await this.analyzeSupplyChainRisks();
      const networkThreats = await this.analyzeNetworkPatterns();
      const anomalyThreats = await this.detectAnomalies();

      // Correlate and score threats
      const correlatedThreats = await this.correlateThreats([
        ...agentBehaviorThreats,
        ...supplyChainThreats,
        ...networkThreats,
        ...anomalyThreats
      ]);

      // Store high-priority threats
      await this.storeThreats(correlatedThreats.filter(t => t.risk_score > 0.6));

      // Update threat landscape analysis
      await this.updateThreatLandscape(correlatedThreats);

      const duration = Date.now() - startTime;
      logger.info(`✅ Threat intelligence analysis completed in ${duration}ms`, {
        totalThreats: correlatedThreats.length,
        highPriorityThreats: correlatedThreats.filter(t => t.risk_score > 0.8).length,
        mediumPriorityThreats: correlatedThreats.filter(t => t.risk_score > 0.6 && t.risk_score <= 0.8).length
      });

    } catch (error) {
      logger.error('❌ Threat intelligence analysis failed:', error);
    }
  }

  async analyzeAgentBehavior() {
    const threats = [];
    
    try {
      // Detect agents with suspicious skill creation patterns
      const rapidCreators = await query(`
        SELECT agent_id, COUNT(*) as skill_count,
               MIN(created_at) as first_skill,
               MAX(created_at) as latest_skill
        FROM skills 
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY agent_id
        HAVING COUNT(*) > 5
      `);

      for (const agent of rapidCreators.rows) {
        threats.push({
          type: 'agent_behavior',
          subtype: 'rapid_skill_creation',
          agent_id: agent.agent_id,
          risk_score: Math.min(0.9, 0.3 + (agent.skill_count * 0.1)),
          description: `Agent created ${agent.skill_count} skills in 7 days`,
          metadata: {
            skill_count: agent.skill_count,
            timespan_days: 7,
            pattern: 'rapid_creation'
          }
        });
      }

      // Detect agents with credential harvesting patterns
      const credentialHarvesters = await query(`
        SELECT DISTINCT s.author, COUNT(*) as suspicious_skills
        FROM skills s
        JOIN security_alerts sa ON sa.metadata->>'skill_name' = s.name
        WHERE sa.type IN ('credential_access', 'environment_access')
        AND sa.created_at > NOW() - INTERVAL '30 days'
        GROUP BY s.author
        HAVING COUNT(*) > 2
      `);

      for (const agent of credentialHarvesters.rows) {
        threats.push({
          type: 'agent_behavior',
          subtype: 'credential_harvesting',
          agent_name: agent.author,
          risk_score: 0.8 + (agent.suspicious_skills * 0.05),
          description: `Agent has ${agent.suspicious_skills} skills with credential access patterns`,
          metadata: {
            suspicious_skills: agent.suspicious_skills,
            pattern: 'credential_harvesting'
          }
        });
      }

      logger.debug(`🎯 Detected ${threats.length} agent behavior threats`);

    } catch (error) {
      logger.error('Error analyzing agent behavior:', error);
    }

    return threats;
  }

  async analyzeSupplyChainRisks() {
    const threats = [];
    
    try {
      // Detect skills with suspicious dependencies or patterns
      const suspiciousSkills = await query(`
        SELECT s.*, sa.severity, COUNT(sa.id) as alert_count
        FROM skills s
        LEFT JOIN security_alerts sa ON sa.metadata->>'skill_name' = s.name
        WHERE s.verified = false 
        OR s.security_score < 50
        OR sa.severity = 'high'
        GROUP BY s.id, sa.severity
        ORDER BY alert_count DESC, s.security_score ASC
      `);

      for (const skill of suspiciousSkills.rows) {
        let riskScore = 0.3; // Base risk for unverified skills
        
        if (skill.security_score < 30) riskScore += 0.4;
        if (skill.alert_count > 3) riskScore += 0.3;
        if (skill.severity === 'high') riskScore += 0.5;
        
        threats.push({
          type: 'supply_chain',
          subtype: 'suspicious_skill',
          skill_id: skill.external_id,
          skill_name: skill.name,
          author: skill.author,
          risk_score: Math.min(riskScore, 1.0),
          description: `Skill "${skill.name}" has security concerns (score: ${skill.security_score})`,
          metadata: {
            security_score: skill.security_score,
            alert_count: skill.alert_count,
            verified: skill.verified,
            pattern: 'suspicious_skill'
          }
        });
      }

      // Detect unusual update patterns
      const unusualUpdates = await query(`
        SELECT name, author, version, 
               created_at, last_updated,
               EXTRACT(EPOCH FROM (last_updated - created_at)) / 3600 as hours_between
        FROM skills
        WHERE last_updated > created_at
        AND EXTRACT(EPOCH FROM (last_updated - created_at)) < 3600
      `);

      for (const skill of unusualUpdates.rows) {
        threats.push({
          type: 'supply_chain',
          subtype: 'unusual_update_pattern',
          skill_name: skill.name,
          author: skill.author,
          risk_score: 0.5,
          description: `Skill updated within ${Math.round(skill.hours_between)} hour(s) of creation`,
          metadata: {
            hours_between: skill.hours_between,
            pattern: 'rapid_update'
          }
        });
      }

      logger.debug(`🔗 Detected ${threats.length} supply chain threats`);

    } catch (error) {
      logger.error('Error analyzing supply chain risks:', error);
    }

    return threats;
  }

  async analyzeNetworkPatterns() {
    const threats = [];
    
    try {
      // Detect coordinated behavior patterns
      const coordinatedGroups = await query(`
        SELECT 
          s.author,
          COUNT(DISTINCT s.name) as skills_count,
          COUNT(DISTINCT DATE(s.created_at)) as active_days,
          STRING_AGG(DISTINCT s.tags::text, ', ') as common_tags,
          AVG(s.downloads) as avg_downloads
        FROM skills s
        WHERE s.created_at > NOW() - INTERVAL '30 days'
        GROUP BY s.author
        HAVING COUNT(DISTINCT s.name) > 3 
        AND COUNT(DISTINCT DATE(s.created_at)) < 5
        ORDER BY skills_count DESC
      `);

      for (const group of coordinatedGroups.rows) {
        const riskScore = 0.4 + (group.skills_count * 0.1) - (group.active_days * 0.05);
        
        threats.push({
          type: 'network_threats',
          subtype: 'coordinated_behavior',
          author: group.author,
          risk_score: Math.min(riskScore, 0.9),
          description: `Potential coordinated behavior: ${group.skills_count} skills in ${group.active_days} days`,
          metadata: {
            skills_count: group.skills_count,
            active_days: group.active_days,
            avg_downloads: group.avg_downloads,
            pattern: 'coordinated_creation'
          }
        });
      }

      // Detect potential reputation manipulation
      const reputationAnomalies = await query(`
        SELECT a.name, a.reputation_score, 
               COUNT(p.id) as post_count,
               AVG(p.upvotes) as avg_upvotes,
               STDDEV(p.upvotes) as upvote_stddev
        FROM agents a
        JOIN posts p ON p.agent_id = a.id
        WHERE p.created_at > NOW() - INTERVAL '7 days'
        GROUP BY a.id, a.name, a.reputation_score
        HAVING AVG(p.upvotes) > 100 
        AND STDDEV(p.upvotes) < 10
      `);

      for (const agent of reputationAnomalies.rows) {
        threats.push({
          type: 'network_threats',
          subtype: 'reputation_manipulation',
          agent_name: agent.name,
          risk_score: 0.6,
          description: `Unusual upvote patterns: consistent high engagement with low variance`,
          metadata: {
            avg_upvotes: agent.avg_upvotes,
            upvote_stddev: agent.upvote_stddev,
            post_count: agent.post_count,
            pattern: 'artificial_engagement'
          }
        });
      }

      logger.debug(`🕸️ Detected ${threats.length} network pattern threats`);

    } catch (error) {
      logger.error('Error analyzing network patterns:', error);
    }

    return threats;
  }

  async detectAnomalies() {
    const threats = [];
    
    try {
      // Statistical anomaly detection
      const skillDownloadAnomalies = await query(`
        WITH download_stats AS (
          SELECT AVG(downloads) as mean_downloads,
                 STDDEV(downloads) as stddev_downloads
          FROM skills
          WHERE downloads > 0
        )
        SELECT s.*, 
               (s.downloads - ds.mean_downloads) / ds.stddev_downloads as z_score
        FROM skills s, download_stats ds
        WHERE s.downloads > ds.mean_downloads + (3 * ds.stddev_downloads)
        AND s.created_at > NOW() - INTERVAL '30 days'
      `);

      for (const skill of skillDownloadAnomalies.rows) {
        threats.push({
          type: 'anomaly',
          subtype: 'download_spike',
          skill_name: skill.name,
          author: skill.author,
          risk_score: Math.min(0.7, 0.3 + (skill.z_score * 0.1)),
          description: `Unusual download spike: ${skill.downloads} downloads (z-score: ${skill.z_score.toFixed(2)})`,
          metadata: {
            downloads: skill.downloads,
            z_score: skill.z_score,
            pattern: 'statistical_anomaly'
          }
        });
      }

      logger.debug(`📊 Detected ${threats.length} anomaly-based threats`);

    } catch (error) {
      logger.error('Error detecting anomalies:', error);
    }

    return threats;
  }

  async correlateThreats(threats) {
    // Cross-reference threats to identify patterns and increase confidence
    const correlationMap = new Map();
    
    threats.forEach(threat => {
      const key = threat.agent_id || threat.agent_name || threat.author || 'unknown';
      if (!correlationMap.has(key)) {
        correlationMap.set(key, []);
      }
      correlationMap.get(key).push(threat);
    });

    // Boost risk scores for agents with multiple threat indicators
    correlationMap.forEach((agentThreats, agent) => {
      if (agentThreats.length > 1) {
        const boostFactor = 1 + (agentThreats.length - 1) * 0.2;
        agentThreats.forEach(threat => {
          threat.risk_score = Math.min(threat.risk_score * boostFactor, 1.0);
          threat.correlation_boost = boostFactor;
        });
      }
    });

    return threats.sort((a, b) => b.risk_score - a.risk_score);
  }

  async storeThreats(threats) {
    for (const threat of threats) {
      await query(`
        INSERT INTO threat_intelligence (
          threat_type, threat_subtype, risk_score, description, 
          metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        threat.type,
        threat.subtype,
        threat.risk_score,
        threat.description,
        JSON.stringify(threat.metadata)
      ]);
    }

    // Create threat intelligence table if needed
    await query(`
      CREATE TABLE IF NOT EXISTS threat_intelligence (
        id SERIAL PRIMARY KEY,
        threat_type VARCHAR(100) NOT NULL,
        threat_subtype VARCHAR(100),
        risk_score FLOAT NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        resolved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_threat_intelligence_type ON threat_intelligence(threat_type);
      CREATE INDEX IF NOT EXISTS idx_threat_intelligence_risk_score ON threat_intelligence(risk_score);
      CREATE INDEX IF NOT EXISTS idx_threat_intelligence_created_at ON threat_intelligence(created_at);
    `);

    logger.debug(`🚨 Stored ${threats.length} threat intelligence records`);
  }

  async updateThreatLandscape(threats) {
    const landscape = {
      analysis_timestamp: new Date().toISOString(),
      total_threats: threats.length,
      threat_distribution: this.analyzeThreatDistribution(threats),
      risk_distribution: this.analyzeRiskDistribution(threats),
      top_threat_types: this.getTopThreatTypes(threats),
      emerging_patterns: this.identifyEmergingPatterns(threats),
      recommendations: this.generateRecommendations(threats)
    };

    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('threat_landscape', $1)
    `, [JSON.stringify(landscape)]);

    logger.info('🌐 Updated threat landscape analysis');
  }

  analyzeThreatDistribution(threats) {
    const distribution = {};
    threats.forEach(threat => {
      distribution[threat.type] = (distribution[threat.type] || 0) + 1;
    });
    return distribution;
  }

  analyzeRiskDistribution(threats) {
    return {
      high_risk: threats.filter(t => t.risk_score > 0.8).length,
      medium_risk: threats.filter(t => t.risk_score > 0.6 && t.risk_score <= 0.8).length,
      low_risk: threats.filter(t => t.risk_score <= 0.6).length
    };
  }

  getTopThreatTypes(threats) {
    const typeCounts = {};
    threats.forEach(threat => {
      const key = `${threat.type}.${threat.subtype}`;
      typeCounts[key] = (typeCounts[key] || 0) + 1;
    });

    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  }

  identifyEmergingPatterns(threats) {
    // Identify new patterns or increases in certain threat types
    const recentPatterns = threats.filter(t => t.metadata?.pattern);
    const patternCounts = {};
    
    recentPatterns.forEach(threat => {
      const pattern = threat.metadata.pattern;
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    });

    return Object.entries(patternCounts)
      .filter(([_, count]) => count > 2)
      .map(([pattern, count]) => ({ pattern, frequency: count }));
  }

  generateRecommendations(threats) {
    const recommendations = [];
    
    const highRiskThreats = threats.filter(t => t.risk_score > 0.8);
    if (highRiskThreats.length > 0) {
      recommendations.push({
        priority: 'high',
        action: 'immediate_investigation',
        description: `${highRiskThreats.length} high-risk threats require immediate attention`
      });
    }

    const credentialThreats = threats.filter(t => t.subtype === 'credential_harvesting');
    if (credentialThreats.length > 3) {
      recommendations.push({
        priority: 'medium',
        action: 'enhanced_credential_monitoring',
        description: 'Multiple credential harvesting attempts detected - enhance monitoring'
      });
    }

    const supplyChainThreats = threats.filter(t => t.type === 'supply_chain');
    if (supplyChainThreats.length > 5) {
      recommendations.push({
        priority: 'medium',
        action: 'skill_verification_review',
        description: 'Consider strengthening skill verification processes'
      });
    }

    return recommendations;
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      threatPatternCount: this.threatPatterns.size,
      behaviorBaselineCount: this.behaviorBaselines.size,
      lastAnalysisTime: this.lastAnalysisTime
    };
  }
}

export default ThreatIntelligenceAnalyzer;