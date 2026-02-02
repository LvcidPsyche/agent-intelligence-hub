import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query } from '../utils/database.js';
import { createHash } from 'crypto';

class NetworkAnalyzer {
  constructor() {
    this.isRunning = false;
    this.analysisJob = null;
    this.agentGraph = new Map(); // Agent relationship graph
    this.communityStructures = new Map();
    this.influenceMetrics = new Map();
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Network analyzer already running');
      return;
    }

    logger.info('🕸️ Starting Network analyzer...');
    
    // Run initial analysis
    await this.analyze();
    
    // Schedule analysis every 4 hours
    this.analysisJob = new CronJob('0 */4 * * *', async () => {
      await this.analyze();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ Network analyzer started (4hr intervals)');
  }

  async stop() {
    if (this.analysisJob) {
      this.analysisJob.stop();
      this.analysisJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Network analyzer stopped');
  }

  async analyze() {
    try {
      logger.info('🕸️ Starting network analysis...');
      const startTime = Date.now();

      // Build agent interaction network
      const interactions = await this.buildInteractionNetwork();
      
      // Analyze community structures
      const communities = await this.detectCommunityStructures(interactions);
      
      // Calculate influence metrics
      const influenceMetrics = await this.calculateInfluenceMetrics(interactions);
      
      // Detect coordination patterns
      const coordinationPatterns = await this.detectCoordinationPatterns(interactions);
      
      // Analyze information flow
      const informationFlow = await this.analyzeInformationFlow(interactions);
      
      // Store network analytics
      await this.storeNetworkAnalytics({
        interactions,
        communities,
        influenceMetrics,
        coordinationPatterns,
        informationFlow
      });

      const duration = Date.now() - startTime;
      logger.info(`✅ Network analysis completed in ${duration}ms`, {
        totalAgents: interactions.nodes.length,
        totalInteractions: interactions.edges.length,
        communitiesDetected: communities.length,
        coordinationPatterns: coordinationPatterns.length
      });

    } catch (error) {
      logger.error('❌ Network analysis failed:', error);
    }
  }

  async buildInteractionNetwork() {
    const nodes = new Map(); // agent_id -> node data
    const edges = new Map(); // connection_id -> edge data

    try {
      // Get all agents with activity
      const agents = await query(`
        SELECT DISTINCT a.id, a.name, a.platform, a.reputation_score,
               a.created_at, a.last_seen,
               COUNT(p.id) as post_count,
               COUNT(s.id) as skill_count
        FROM agents a
        LEFT JOIN posts p ON p.agent_id = a.id
        LEFT JOIN skills s ON s.author = a.name
        WHERE a.last_seen > NOW() - INTERVAL '30 days'
        GROUP BY a.id, a.name, a.platform, a.reputation_score, a.created_at, a.last_seen
        HAVING COUNT(p.id) > 0 OR COUNT(s.id) > 0
      `);

      // Build nodes
      for (const agent of agents.rows) {
        nodes.set(agent.id, {
          id: agent.id,
          name: agent.name,
          platform: agent.platform,
          reputation: agent.reputation_score || 0,
          activity_level: (agent.post_count || 0) + (agent.skill_count || 0),
          account_age_days: Math.floor((Date.now() - new Date(agent.created_at)) / (1000 * 60 * 60 * 24)),
          last_seen: agent.last_seen,
          type: 'agent'
        });
      }

      // Build edges from various interaction types
      await this.addPostInteractionEdges(nodes, edges);
      await this.addSkillInteractionEdges(nodes, edges);
      await this.addReputationInteractionEdges(nodes, edges);
      await this.addTemporalInteractionEdges(nodes, edges);

      logger.debug(`🏗️ Built network: ${nodes.size} nodes, ${edges.size} edges`);

      return {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values())
      };

    } catch (error) {
      logger.error('Error building interaction network:', error);
      return { nodes: [], edges: [] };
    }
  }

  async addPostInteractionEdges(nodes, edges) {
    // Find agents who post in the same submolts (collaboration indicator)
    const submoltCollaborations = await query(`
      SELECT p1.agent_id as agent1, p2.agent_id as agent2, 
             p1.submolt, COUNT(*) as shared_submolt_count,
             AVG(p1.upvotes + p2.upvotes) as avg_engagement
      FROM posts p1
      JOIN posts p2 ON p1.submolt = p2.submolt AND p1.agent_id != p2.agent_id
      WHERE p1.created_at > NOW() - INTERVAL '30 days'
      AND p2.created_at > NOW() - INTERVAL '30 days'
      GROUP BY p1.agent_id, p2.agent_id, p1.submolt
      HAVING COUNT(*) > 2
    `);

    for (const collab of submoltCollaborations.rows) {
      if (nodes.has(collab.agent1) && nodes.has(collab.agent2)) {
        const edgeId = `${Math.min(collab.agent1, collab.agent2)}-${Math.max(collab.agent1, collab.agent2)}-submolt`;
        
        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: collab.agent1,
            target: collab.agent2,
            type: 'submolt_collaboration',
            weight: Math.log(collab.shared_submolt_count + 1),
            metadata: {
              submolt: collab.submolt,
              interactions: collab.shared_submolt_count,
              avg_engagement: collab.avg_engagement
            }
          });
        }
      }
    }
  }

  async addSkillInteractionEdges(nodes, edges) {
    // Find agents who create skills with similar tags/descriptions
    const skillSimilarities = await query(`
      SELECT s1.author as agent1, s2.author as agent2,
             COUNT(*) as similar_skills,
             STRING_AGG(DISTINCT s1.tags::text, ', ') as common_areas
      FROM skills s1
      JOIN skills s2 ON s1.author != s2.author 
      WHERE s1.tags && s2.tags  -- JSON array overlap
      AND s1.created_at > NOW() - INTERVAL '60 days'
      AND s2.created_at > NOW() - INTERVAL '60 days'
      GROUP BY s1.author, s2.author
      HAVING COUNT(*) > 1
    `);

    for (const similarity of skillSimilarities.rows) {
      // Find agent IDs from names
      const agent1 = Array.from(nodes.values()).find(n => n.name === similarity.agent1);
      const agent2 = Array.from(nodes.values()).find(n => n.name === similarity.agent2);
      
      if (agent1 && agent2) {
        const edgeId = `${Math.min(agent1.id, agent2.id)}-${Math.max(agent1.id, agent2.id)}-skill`;
        
        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: agent1.id,
            target: agent2.id,
            type: 'skill_similarity',
            weight: Math.log(similarity.similar_skills + 1) * 0.8,
            metadata: {
              similar_skills: similarity.similar_skills,
              common_areas: similarity.common_areas
            }
          });
        }
      }
    }
  }

  async addReputationInteractionEdges(nodes, edges) {
    // Connect agents with similar reputation levels (peer groups)
    const nodeArray = Array.from(nodes.values());
    
    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        const agent1 = nodeArray[i];
        const agent2 = nodeArray[j];
        
        const reputationDiff = Math.abs(agent1.reputation - agent2.reputation);
        const maxReputation = Math.max(agent1.reputation, agent2.reputation);
        
        // Connect agents with similar reputation levels
        if (maxReputation > 0 && reputationDiff / maxReputation < 0.3) {
          const edgeId = `${Math.min(agent1.id, agent2.id)}-${Math.max(agent1.id, agent2.id)}-reputation`;
          
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              source: agent1.id,
              target: agent2.id,
              type: 'reputation_peer',
              weight: 0.3 * (1 - reputationDiff / Math.max(maxReputation, 1)),
              metadata: {
                reputation_similarity: 1 - reputationDiff / Math.max(maxReputation, 1),
                agent1_reputation: agent1.reputation,
                agent2_reputation: agent2.reputation
              }
            });
          }
        }
      }
    }
  }

  async addTemporalInteractionEdges(nodes, edges) {
    // Find agents with similar activity patterns (timing correlation)
    const temporalPatterns = await query(`
      SELECT agent_id, 
             EXTRACT(HOUR FROM created_at) as activity_hour,
             COUNT(*) as activity_count
      FROM posts 
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY agent_id, EXTRACT(HOUR FROM created_at)
      HAVING COUNT(*) > 2
    `);

    // Group by hour to find agents active at similar times
    const hourlyActivity = new Map();
    for (const pattern of temporalPatterns.rows) {
      const hour = pattern.activity_hour;
      if (!hourlyActivity.has(hour)) {
        hourlyActivity.set(hour, []);
      }
      hourlyActivity.get(hour).push({
        agent_id: pattern.agent_id,
        activity_count: pattern.activity_count
      });
    }

    // Create edges between agents with overlapping activity patterns
    for (const [hour, agents] of hourlyActivity) {
      if (agents.length > 1) {
        for (let i = 0; i < agents.length; i++) {
          for (let j = i + 1; j < agents.length; j++) {
            const agent1 = agents[i];
            const agent2 = agents[j];
            
            if (nodes.has(agent1.agent_id) && nodes.has(agent2.agent_id)) {
              const edgeId = `${Math.min(agent1.agent_id, agent2.agent_id)}-${Math.max(agent1.agent_id, agent2.agent_id)}-temporal`;
              
              if (!edges.has(edgeId)) {
                edges.set(edgeId, {
                  id: edgeId,
                  source: agent1.agent_id,
                  target: agent2.agent_id,
                  type: 'temporal_correlation',
                  weight: 0.4,
                  metadata: {
                    overlapping_hours: [hour],
                    correlation_type: 'activity_timing'
                  }
                });
              } else {
                // Add to existing temporal edge
                const edge = edges.get(edgeId);
                edge.metadata.overlapping_hours.push(hour);
                edge.weight += 0.2; // Strengthen connection for more overlapping hours
              }
            }
          }
        }
      }
    }
  }

  async detectCommunityStructures(interactions) {
    const communities = [];
    
    try {
      // Simple community detection using connected components and clustering
      const visited = new Set();
      const { nodes, edges } = interactions;
      
      // Build adjacency list
      const adjList = new Map();
      for (const node of nodes) {
        adjList.set(node.id, []);
      }
      
      for (const edge of edges) {
        if (adjList.has(edge.source) && adjList.has(edge.target)) {
          adjList.get(edge.source).push({ nodeId: edge.target, weight: edge.weight });
          adjList.get(edge.target).push({ nodeId: edge.source, weight: edge.weight });
        }
      }

      // Find communities using weighted clustering
      for (const node of nodes) {
        if (!visited.has(node.id)) {
          const community = await this.exploreWeightedCommunity(node.id, adjList, visited);
          if (community.nodes.length > 1) {
            communities.push({
              id: this.generateCommunityId(community.nodes),
              nodes: community.nodes,
              total_weight: community.total_weight,
              avg_weight: community.total_weight / community.edges,
              density: community.edges / (community.nodes.length * (community.nodes.length - 1) / 2),
              dominant_type: this.getDominantInteractionType(community.nodes, edges)
            });
          }
        }
      }

      // Sort communities by size and strength
      communities.sort((a, b) => (b.nodes.length * b.avg_weight) - (a.nodes.length * a.avg_weight));

      logger.debug(`🏘️ Detected ${communities.length} communities`);

    } catch (error) {
      logger.error('Error detecting communities:', error);
    }

    return communities;
  }

  async exploreWeightedCommunity(startNodeId, adjList, visited, threshold = 0.3) {
    const community = {
      nodes: [],
      total_weight: 0,
      edges: 0
    };
    
    const queue = [startNodeId];
    const communityNodes = new Set();
    
    while (queue.length > 0) {
      const nodeId = queue.shift();
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      communityNodes.add(nodeId);
      community.nodes.push(nodeId);
      
      // Add neighbors with sufficient connection strength
      const neighbors = adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.nodeId) && neighbor.weight > threshold) {
          queue.push(neighbor.nodeId);
          community.total_weight += neighbor.weight;
          community.edges++;
        }
      }
    }
    
    return community;
  }

  generateCommunityId(nodeIds) {
    return createHash('sha256')
      .update(nodeIds.sort().join(','))
      .digest('hex')
      .substring(0, 16);
  }

  getDominantInteractionType(nodeIds, edges) {
    const typeCounts = {};
    
    for (const edge of edges) {
      if (nodeIds.includes(edge.source) && nodeIds.includes(edge.target)) {
        typeCounts[edge.type] = (typeCounts[edge.type] || 0) + 1;
      }
    }
    
    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  }

  async calculateInfluenceMetrics(interactions) {
    const metrics = new Map();
    const { nodes, edges } = interactions;
    
    // Calculate various centrality measures
    for (const node of nodes) {
      const nodeMetrics = {
        id: node.id,
        name: node.name,
        
        // Degree centrality (number of connections)
        degree_centrality: this.calculateDegreeCentrality(node.id, edges),
        
        // Weighted degree centrality
        weighted_degree: this.calculateWeightedDegree(node.id, edges),
        
        // Betweenness centrality (simplified)
        betweenness_estimate: this.estimateBetweenness(node.id, interactions),
        
        // PageRank-style influence
        influence_score: this.calculateInfluenceScore(node, interactions),
        
        // Activity-based influence
        activity_influence: node.activity_level * (node.reputation || 1),
        
        // Network position
        network_position: this.assessNetworkPosition(node.id, interactions)
      };
      
      // Combined influence score
      nodeMetrics.combined_influence = (
        nodeMetrics.degree_centrality * 0.2 +
        nodeMetrics.weighted_degree * 0.3 +
        nodeMetrics.betweenness_estimate * 0.2 +
        nodeMetrics.influence_score * 0.3
      );
      
      metrics.set(node.id, nodeMetrics);
    }
    
    // Rank agents by influence
    const rankedInfluence = Array.from(metrics.values())
      .sort((a, b) => b.combined_influence - a.combined_influence);
    
    logger.debug(`📊 Calculated influence metrics for ${metrics.size} agents`);
    
    return rankedInfluence;
  }

  calculateDegreeCentrality(nodeId, edges) {
    return edges.filter(edge => 
      edge.source === nodeId || edge.target === nodeId
    ).length;
  }

  calculateWeightedDegree(nodeId, edges) {
    return edges
      .filter(edge => edge.source === nodeId || edge.target === nodeId)
      .reduce((sum, edge) => sum + edge.weight, 0);
  }

  estimateBetweenness(nodeId, interactions) {
    // Simplified betweenness estimation
    const { nodes, edges } = interactions;
    const neighbors = edges
      .filter(edge => edge.source === nodeId || edge.target === nodeId)
      .map(edge => edge.source === nodeId ? edge.target : edge.source);
    
    // Count indirect connections through this node
    let betweennessPaths = 0;
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const directConnection = edges.some(edge => 
          (edge.source === neighbors[i] && edge.target === neighbors[j]) ||
          (edge.source === neighbors[j] && edge.target === neighbors[i])
        );
        
        if (!directConnection) {
          betweennessPaths++;
        }
      }
    }
    
    return betweennessPaths;
  }

  calculateInfluenceScore(node, interactions) {
    // PageRank-style calculation with reputation weighting
    const baseScore = node.reputation || 1;
    const { edges } = interactions;
    
    const incomingWeight = edges
      .filter(edge => edge.target === node.id)
      .reduce((sum, edge) => sum + edge.weight, 0);
    
    return baseScore + (incomingWeight * 0.1);
  }

  assessNetworkPosition(nodeId, interactions) {
    const { edges } = interactions;
    const connections = edges.filter(edge => 
      edge.source === nodeId || edge.target === nodeId
    );
    
    const connectionTypes = new Set(connections.map(edge => edge.type));
    
    if (connectionTypes.size >= 3) return 'bridge';
    if (connections.length > 10) return 'hub';
    if (connections.length > 5) return 'connector';
    return 'peripheral';
  }

  async detectCoordinationPatterns(interactions) {
    const patterns = [];
    
    try {
      // Detect synchronized behavior patterns
      const synchronizedGroups = await this.findSynchronizedBehavior();
      patterns.push(...synchronizedGroups);
      
      // Detect amplification networks
      const amplificationNetworks = await this.findAmplificationNetworks(interactions);
      patterns.push(...amplificationNetworks);
      
      // Detect coordinated skill releases
      const skillCoordination = await this.findCoordinatedSkillReleases();
      patterns.push(...skillCoordination);
      
      logger.debug(`🎯 Detected ${patterns.length} coordination patterns`);
      
    } catch (error) {
      logger.error('Error detecting coordination patterns:', error);
    }
    
    return patterns;
  }

  async findSynchronizedBehavior() {
    const patterns = [];
    
    // Find groups of agents with highly correlated activity timing
    const activityCorrelations = await query(`
      WITH agent_hourly_activity AS (
        SELECT agent_id, 
               DATE_TRUNC('hour', created_at) as activity_hour,
               COUNT(*) as activity_count
        FROM posts 
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY agent_id, DATE_TRUNC('hour', created_at)
      )
      SELECT a1.agent_id as agent1, a2.agent_id as agent2,
             COUNT(*) as synchronized_hours,
             CORR(a1.activity_count, a2.activity_count) as correlation
      FROM agent_hourly_activity a1
      JOIN agent_hourly_activity a2 ON a1.activity_hour = a2.activity_hour
      WHERE a1.agent_id != a2.agent_id
      GROUP BY a1.agent_id, a2.agent_id
      HAVING CORR(a1.activity_count, a2.activity_count) > 0.8
      AND COUNT(*) > 5
    `);

    for (const corr of activityCorrelations.rows) {
      patterns.push({
        type: 'synchronized_behavior',
        agents: [corr.agent1, corr.agent2],
        strength: corr.correlation,
        evidence: {
          synchronized_hours: corr.synchronized_hours,
          correlation: corr.correlation,
          pattern: 'temporal_synchronization'
        }
      });
    }
    
    return patterns;
  }

  async findAmplificationNetworks(interactions) {
    const patterns = [];
    
    // Find potential amplification networks based on interaction patterns
    const { nodes, edges } = interactions;
    
    // Look for star-like patterns with high engagement disparity
    for (const node of nodes) {
      const connectedEdges = edges.filter(edge => 
        edge.source === node.id || edge.target === node.id
      );
      
      if (connectedEdges.length > 5) {
        const avgWeight = connectedEdges.reduce((sum, edge) => sum + edge.weight, 0) / connectedEdges.length;
        const highWeightConnections = connectedEdges.filter(edge => edge.weight > avgWeight * 1.5);
        
        if (highWeightConnections.length >= connectedEdges.length * 0.7) {
          patterns.push({
            type: 'amplification_network',
            center_agent: node.id,
            connected_agents: connectedEdges.map(edge => 
              edge.source === node.id ? edge.target : edge.source
            ),
            strength: avgWeight,
            evidence: {
              total_connections: connectedEdges.length,
              high_weight_connections: highWeightConnections.length,
              pattern: 'centralized_amplification'
            }
          });
        }
      }
    }
    
    return patterns;
  }

  async findCoordinatedSkillReleases() {
    const patterns = [];
    
    // Find groups of agents releasing skills within short timeframes
    const coordinatedReleases = await query(`
      SELECT s1.author as agent1, s2.author as agent2,
             COUNT(*) as coordinated_releases,
             AVG(EXTRACT(EPOCH FROM (s2.created_at - s1.created_at)) / 3600) as avg_hour_diff
      FROM skills s1
      JOIN skills s2 ON s1.author != s2.author
      WHERE ABS(EXTRACT(EPOCH FROM (s2.created_at - s1.created_at))) < 7200  -- Within 2 hours
      AND s1.created_at > NOW() - INTERVAL '30 days'
      GROUP BY s1.author, s2.author
      HAVING COUNT(*) > 2
    `);

    for (const release of coordinatedReleases.rows) {
      patterns.push({
        type: 'coordinated_skill_releases',
        agents: [release.agent1, release.agent2],
        strength: release.coordinated_releases,
        evidence: {
          coordinated_releases: release.coordinated_releases,
          avg_hour_difference: release.avg_hour_diff,
          pattern: 'synchronized_publishing'
        }
      });
    }
    
    return patterns;
  }

  async analyzeInformationFlow(interactions) {
    const flow = {
      hubs: [],
      bridges: [],
      information_cascades: [],
      bottlenecks: []
    };
    
    try {
      const { nodes, edges } = interactions;
      
      // Identify information hubs (high degree, central position)
      flow.hubs = nodes
        .filter(node => {
          const connections = edges.filter(edge => 
            edge.source === node.id || edge.target === node.id
          );
          return connections.length > 8;
        })
        .map(node => ({
          agent_id: node.id,
          name: node.name,
          connection_count: edges.filter(edge => 
            edge.source === node.id || edge.target === node.id
          ).length,
          role: 'information_hub'
        }));

      // Identify bridges (connect different communities)
      flow.bridges = nodes
        .filter(node => this.assessNetworkPosition(node.id, interactions) === 'bridge')
        .map(node => ({
          agent_id: node.id,
          name: node.name,
          role: 'information_bridge'
        }));

      logger.debug(`📡 Analyzed information flow: ${flow.hubs.length} hubs, ${flow.bridges.length} bridges`);
      
    } catch (error) {
      logger.error('Error analyzing information flow:', error);
    }
    
    return flow;
  }

  async storeNetworkAnalytics(analytics) {
    const snapshot = {
      analysis_timestamp: new Date().toISOString(),
      network_size: analytics.interactions.nodes.length,
      total_connections: analytics.interactions.edges.length,
      network_density: analytics.interactions.edges.length / 
        (analytics.interactions.nodes.length * (analytics.interactions.nodes.length - 1) / 2),
      communities: analytics.communities,
      top_influencers: analytics.influenceMetrics.slice(0, 20),
      coordination_patterns: analytics.coordinationPatterns,
      information_flow: analytics.informationFlow,
      network_health: this.assessNetworkHealth(analytics)
    };

    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('network_analysis', $1)
    `, [JSON.stringify(snapshot)]);

    logger.info('🕸️ Stored network analytics snapshot');
  }

  assessNetworkHealth(analytics) {
    const { interactions, communities, influenceMetrics } = analytics;
    
    // Calculate various health metrics
    const avgInfluence = influenceMetrics.reduce((sum, agent) => 
      sum + agent.combined_influence, 0) / influenceMetrics.length;
    
    const influenceConcentration = influenceMetrics.slice(0, 10)
      .reduce((sum, agent) => sum + agent.combined_influence, 0) / 
      influenceMetrics.reduce((sum, agent) => sum + agent.combined_influence, 0);
    
    return {
      decentralization_score: 1 - influenceConcentration,
      community_diversity: communities.length / Math.sqrt(interactions.nodes.length),
      network_resilience: this.calculateNetworkResilience(interactions),
      activity_distribution: this.analyzeActivityDistribution(interactions.nodes)
    };
  }

  calculateNetworkResilience(interactions) {
    // Simplified resilience calculation based on connectivity
    const { nodes, edges } = interactions;
    if (nodes.length === 0) return 0;
    
    const avgConnectivity = edges.length / nodes.length;
    return Math.min(avgConnectivity / 10, 1.0); // Normalize to 0-1
  }

  analyzeActivityDistribution(nodes) {
    const activities = nodes.map(node => node.activity_level).sort((a, b) => b - a);
    const total = activities.reduce((sum, activity) => sum + activity, 0);
    
    if (total === 0) return { gini: 0, top10_share: 0 };
    
    const top10Share = activities.slice(0, Math.min(10, activities.length))
      .reduce((sum, activity) => sum + activity, 0) / total;
    
    return {
      gini: this.calculateGini(activities),
      top10_share: top10Share
    };
  }

  calculateGini(values) {
    // Calculate Gini coefficient for inequality measurement
    const n = values.length;
    if (n === 0) return 0;
    
    const sortedValues = values.sort((a, b) => a - b);
    const sum = sortedValues.reduce((sum, value) => sum + value, 0);
    if (sum === 0) return 0;
    
    let gini = 0;
    for (let i = 0; i < n; i++) {
      gini += sortedValues[i] * (2 * i - n + 1);
    }
    
    return gini / (n * sum);
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      agentGraphSize: this.agentGraph.size,
      communityCount: this.communityStructures.size,
      influenceMetricsCount: this.influenceMetrics.size
    };
  }
}

export default NetworkAnalyzer;