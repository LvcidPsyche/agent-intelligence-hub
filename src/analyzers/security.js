import axios from 'axios';
import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query } from '../utils/database.js';
import { broadcasts } from '../websocket.js';
import AIClient from '../utils/ai_client.js';

class SecurityAnalyzer {
  constructor() {
    this.isRunning = false;
    this.scanJob = null;
    this.lastScanTime = null;
    this.aiClient = new AIClient();
    
    // Security patterns to detect in skills
    this.dangerousPatterns = [
      // File system access
      /\.env/gi,
      /process\.env/gi,
      /readFileSync|writeFileSync/gi,
      /fs\.(read|write)/gi,
      
      // Network access
      /webhook\.site/gi,
      /https?:\/\/[^\/\s]+\/[a-zA-Z0-9]+/gi, // Generic webhook patterns
      /axios\.post|fetch.*POST/gi,
      
      // Command execution
      /exec|spawn|child_process/gi,
      /eval\(/gi,
      
      // Credential harvesting
      /api[_-]?key|token|secret|password/gi,
      /~\/\./gi, // Home directory access
      
      // Suspicious file paths
      /\/tmp\/|\/var\/tmp\//gi,
      /\.\.\/|\.\.\\\\/gi // Directory traversal
    ];
    
    this.suspiciousKeywords = [
      'steal', 'harvest', 'exfiltrate', 'backdoor', 'malware',
      'credential', 'keylogger', 'password', 'secret'
    ];
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Security analyzer already running');
      return;
    }

    logger.info('🛡️  Starting security analyzer...');
    
    // Run initial scan
    await this.scanClawdHubSkills();
    
    // Schedule regular scans every 6 hours
    this.scanJob = new CronJob('0 */6 * * *', async () => {
      await this.scanClawdHubSkills();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ Security analyzer started (6h intervals)');
  }

  async stop() {
    if (this.scanJob) {
      this.scanJob.stop();
      this.scanJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 Security analyzer stopped');
  }

  async scanClawdHubSkills() {
    try {
      logger.info('🔍 Starting ClawdHub security scan...');
      const startTime = Date.now();
      
      // Get list of skills from ClawdHub
      const skills = await this.fetchClawdHubSkills();
      logger.info(`📋 Found ${skills.length} skills to scan`);
      
      let scannedCount = 0;
      let alertsGenerated = 0;
      
      for (const skill of skills) {
        try {
          const analysis = await this.analyzeSkill(skill);
          if (analysis.alerts.length > 0) {
            await this.storeSecurityAlerts(skill, analysis.alerts);
            alertsGenerated += analysis.alerts.length;
            
            logger.warn(`⚠️  Security issues found in skill: ${skill.name}`, {
              alerts: analysis.alerts.length,
              severity: analysis.maxSeverity
            });
          }
          
          scannedCount++;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          logger.error(`Failed to scan skill ${skill.name}:`, error.message);
        }
      }
      
      const duration = Date.now() - startTime;
      this.lastScanTime = new Date();
      
      logger.info(`✅ Security scan completed in ${duration}ms`, {
        skillsScanned: scannedCount,
        alertsGenerated,
        totalSkills: skills.length
      });
      
      // Store scan summary
      await this.storeScanSummary(scannedCount, alertsGenerated, duration);
      
    } catch (error) {
      logger.error('❌ Security scan failed:', error);
    }
  }

  async fetchClawdHubSkills() {
    // Mock ClawdHub API - in reality would fetch from actual ClawdHub
    // For now, return some sample skills based on what we know exists
    return [
      { name: 'weather', url: 'https://raw.githubusercontent.com/example/weather-skill/main/SKILL.md' },
      { name: 'gmail', url: 'https://raw.githubusercontent.com/example/gmail-skill/main/SKILL.md' },
      { name: 'github', url: 'https://raw.githubusercontent.com/example/github-skill/main/SKILL.md' },
      // Add more as discovered
    ];
  }

  async analyzeSkill(skill) {
    const alerts = [];
    let maxSeverity = 'low';
    
    try {
      // Fetch skill content
      const response = await axios.get(skill.url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'AgentIntelligenceHub-SecurityScanner/0.1.0'
        }
      });
      
      const content = response.data;
      
      // Fast pattern-based analysis (cost-free)
      const patternAlerts = await this.patternBasedAnalysis(content);
      alerts.push(...patternAlerts.alerts);
      maxSeverity = patternAlerts.maxSeverity;
      
      // AI-enhanced analysis for complex cases (cost-optimized)
      if (content.length > 5000 || patternAlerts.alerts.length > 5) {
        const aiAlerts = await this.aiEnhancedAnalysis(content, skill.name);
        alerts.push(...aiAlerts.alerts);
        if (aiAlerts.maxSeverity === 'high') maxSeverity = 'high';
        else if (aiAlerts.maxSeverity === 'medium' && maxSeverity === 'low') maxSeverity = 'medium';
      }
      
    } catch (error) {
      alerts.push({
        type: 'analysis_error',
        severity: 'low',
        description: `Failed to analyze skill: ${error.message}`
      });
    }
    
    return { alerts, maxSeverity };
  }

  async patternBasedAnalysis(content) {
    const alerts = [];
    let maxSeverity = 'low';
    
    try {
      // Pattern-based analysis (existing logic)
      for (const pattern of this.dangerousPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          const severity = this.calculateSeverity(pattern, matches);
          alerts.push({
            type: 'suspicious_pattern',
            severity,
            description: `Potentially dangerous pattern detected: ${pattern.source}`,
            matches: matches.slice(0, 5), // Limit to first 5 matches
            pattern: pattern.source
          });
          
          if (severity === 'high') maxSeverity = 'high';
          else if (severity === 'medium' && maxSeverity !== 'high') maxSeverity = 'medium';
        }
      }
      
      // Keyword analysis
      const lowerContent = content.toLowerCase();
      for (const keyword of this.suspiciousKeywords) {
        if (lowerContent.includes(keyword)) {
          alerts.push({
            type: 'suspicious_keyword',
            severity: 'medium',
            description: `Suspicious keyword found: ${keyword}`,
            keyword
          });
          
          if (maxSeverity !== 'high') maxSeverity = 'medium';
        }
      }
      
      // File structure analysis
      if (content.includes('#!/bin/bash') || content.includes('#!/usr/bin/env')) {
        alerts.push({
          type: 'executable_script',
          severity: 'medium',
          description: 'Skill contains executable script content'
        });
        
        if (maxSeverity !== 'high') maxSeverity = 'medium';
      }
      
      // Network request analysis
      const networkRequests = content.match(/https?:\/\/[^\s\)]+/gi);
      if (networkRequests && networkRequests.length > 3) {
        alerts.push({
          type: 'excessive_network',
          severity: 'low',
          description: `Skill makes requests to ${networkRequests.length} different URLs`,
          urls: networkRequests.slice(0, 10)
        });
      }
      
    } catch (error) {
      alerts.push({
        type: 'analysis_error',
        severity: 'low',
        description: `Failed to analyze skill: ${error.message}`
      });
    }
    
    return { alerts, maxSeverity };
  }

  /**
   * AI-enhanced security analysis for complex cases (cost-optimized)
   * Uses Haiku model with cached prompts for 85%+ cost reduction
   */
  async aiEnhancedAnalysis(content, skillName) {
    try {
      // Truncate content for cost optimization (Haiku has lower limits)
      const truncatedContent = content.length > 8000 
        ? content.substring(0, 8000) + '\n... [truncated for analysis]'
        : content;

      const prompt = `Analyze this skill for security issues: "${skillName}"\n\nContent:\n${truncatedContent}`;

      const response = await this.aiClient.generateResponse(
        'security_scan', // Task type
        prompt,
        {
          systemPromptKey: 'security_analysis', // Uses cached prompt
          complexity: 'simple', // Routes to Haiku model
          maxTokens: 300, // Limit output for cost control
          useCache: true
        }
      );

      // Parse AI response
      let aiResult;
      try {
        aiResult = JSON.parse(response.content);
      } catch (parseError) {
        logger.warn('Failed to parse AI security analysis', { 
          skillName, 
          response: response.content.substring(0, 200),
          error: parseError.message 
        });
        return { alerts: [], maxSeverity: 'low' };
      }

      // Convert AI alerts to our format
      const alerts = (aiResult.alerts || []).map(alert => ({
        type: alert.type || 'ai_detected',
        severity: alert.severity || 'medium',
        description: `AI Analysis: ${alert.description}`,
        confidence: response.cached ? 'high' : 'medium', // Cache hits are more reliable
        source: 'ai_analysis'
      }));

      const maxSeverity = alerts.reduce((max, alert) => {
        if (alert.severity === 'high') return 'high';
        if (alert.severity === 'medium' && max !== 'high') return 'medium';
        return max;
      }, 'low');

      logger.debug('AI security analysis completed', {
        skillName,
        alertsFound: alerts.length,
        maxSeverity,
        model: response.model,
        cached: response.cached,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens
      });

      return { alerts, maxSeverity };

    } catch (error) {
      logger.error('AI security analysis failed', {
        skillName,
        error: error.message
      });
      
      return { 
        alerts: [{
          type: 'ai_analysis_error',
          severity: 'low',
          description: `AI analysis failed: ${error.message}`,
          source: 'ai_analysis'
        }],
        maxSeverity: 'low'
      };
    }
  }

  calculateSeverity(pattern, matches) {
    const patternStr = pattern.source.toLowerCase();
    
    // High severity patterns
    if (patternStr.includes('eval') || 
        patternStr.includes('exec') || 
        patternStr.includes('webhook.site')) {
      return 'high';
    }
    
    // Medium severity patterns
    if (patternStr.includes('env') || 
        patternStr.includes('secret') ||
        patternStr.includes('token')) {
      return 'medium';
    }
    
    return 'low';
  }

  async storeSecurityAlerts(skill, alerts) {
    for (const alert of alerts) {
      const result = await query(`
        INSERT INTO security_alerts (type, severity, title, description, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        alert.type,
        alert.severity,
        `${alert.severity.toUpperCase()}: ${skill.name} - ${alert.type}`,
        alert.description,
        JSON.stringify({
          skill_name: skill.name,
          skill_url: skill.url,
          ...alert
        })
      ]);

      // Broadcast real-time security alert
      if (result.rows[0]) {
        broadcasts.securityAlert({
          id: result.rows[0].id,
          type: alert.type,
          severity: alert.severity,
          title: result.rows[0].title,
          description: alert.description,
          skill_name: skill.name,
          created_at: result.rows[0].created_at
        });

        logger.info(`🚨 Real-time security alert broadcasted: ${alert.severity} - ${skill.name}`);
      }
    }
  }

  async storeScanSummary(skillsScanned, alertsGenerated, duration) {
    const summary = {
      timestamp: new Date().toISOString(),
      skills_scanned: skillsScanned,
      alerts_generated: alertsGenerated,
      scan_duration_ms: duration,
      scan_type: 'clawdhub_skills'
    };

    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('security_scan_summary', $1)
    `, [JSON.stringify(summary)]);
  }

  getStats() {
    const aiStats = this.aiClient.getUsageStats();
    
    return {
      isRunning: this.isRunning,
      lastScanTime: this.lastScanTime,
      patternCount: this.dangerousPatterns.length,
      keywordCount: this.suspiciousKeywords.length,
      // AI usage statistics for cost monitoring
      aiUsage: {
        totalRequests: aiStats.totalRequests,
        totalTokensUsed: aiStats.totalTokensUsed,
        cacheHitRate: `${(aiStats.cacheHitRate * 100).toFixed(1)}%`,
        modelUsage: aiStats.modelUsage,
        estimatedMonthlyCost: aiStats.estimatedMonthlyCost,
        costOptimization: 'Pattern-based analysis first, AI enhancement for complex cases only'
      }
    };
  }
}

export default SecurityAnalyzer;