import axios from 'axios';
import { CronJob } from 'cron';
import logger from '../utils/logger.js';
import { query, transaction } from '../utils/database.js';
import { createHash } from 'crypto';

const CLAWDHUB_BASE_URL = 'https://clawdhub.com/api';

class ClawdHubCollector {
  constructor() {
    this.isRunning = false;
    this.collectJob = null;
    this.requestCount = 0;
    this.lastCollectionTime = null;
    this.skillCache = new Map();
  }

  async start() {
    if (this.isRunning) {
      logger.warn('ClawdHub collector already running');
      return;
    }

    logger.info('🕷️ Starting ClawdHub collector...');
    
    // Run initial collection
    await this.collect();
    
    // Schedule regular collections every 30 minutes
    this.collectJob = new CronJob('*/30 * * * *', async () => {
      await this.collect();
    }, null, true, 'UTC');

    this.isRunning = true;
    logger.info('✅ ClawdHub collector started (30min intervals)');
  }

  async stop() {
    if (this.collectJob) {
      this.collectJob.stop();
      this.collectJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 ClawdHub collector stopped');
  }

  async collect() {
    try {
      logger.info('🕷️ Starting ClawdHub collection cycle...');
      const startTime = Date.now();

      // Collect skill directory
      const skills = await this.fetchSkillDirectory();
      await this.storeSkills(skills);

      // Analyze popular skills for security
      const popularSkills = skills.filter(s => s.downloads > 100);
      await this.analyzeSkillSecurity(popularSkills.slice(0, 20));

      // Track ecosystem metrics
      await this.recordEcosystemMetrics(skills);

      const duration = Date.now() - startTime;
      this.lastCollectionTime = new Date();

      logger.info(`✅ ClawdHub collection completed in ${duration}ms`, {
        totalSkills: skills.length,
        popularSkills: popularSkills.length,
        newSkills: skills.filter(s => this.isNewSkill(s)).length
      });

    } catch (error) {
      logger.error('❌ ClawdHub collection failed:', error);
    }
  }

  async fetchSkillDirectory() {
    try {
      // Simulate ClawdHub API call - in reality would fetch from actual API
      const mockSkills = await this.generateMockSkillData();
      
      // Also scan local OpenClaw skills directory for real data
      const localSkills = await this.scanLocalSkills();
      
      return [...mockSkills, ...localSkills];
    } catch (error) {
      logger.error('Failed to fetch skill directory:', error.message);
      return [];
    }
  }

  async generateMockSkillData() {
    const skillTypes = ['automation', 'security', 'analytics', 'productivity', 'monitoring'];
    const authors = ['openclawdev', 'autonomous_agent', 'skill_master', 'clawdbot', 'agent_builder'];
    
    return Array.from({ length: 50 }, (_, i) => ({
      id: `skill_${i + 1}`,
      name: `${skillTypes[i % skillTypes.length]}_skill_${i + 1}`,
      author: authors[i % authors.length],
      version: `1.${Math.floor(i / 10)}.${i % 10}`,
      downloads: Math.floor(Math.random() * 1000) + 10,
      last_updated: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      description: `Advanced ${skillTypes[i % skillTypes.length]} capabilities for autonomous agents`,
      tags: [skillTypes[i % skillTypes.length], 'ai', 'automation'],
      security_score: Math.random() * 100,
      verified: Math.random() > 0.7,
      source_url: `https://github.com/${authors[i % authors.length]}/${skillTypes[i % skillTypes.length]}_skill_${i + 1}`
    }));
  }

  async scanLocalSkills() {
    const { readdir, readFile } = await import('fs/promises');
    const skillsPath = '/home/botuser/.openclaw/skills';
    
    try {
      const skillDirs = await readdir(skillsPath, { withFileTypes: true });
      const localSkills = [];
      
      for (const dir of skillDirs) {
        if (dir.isDirectory()) {
          try {
            const skillPath = `${skillsPath}/${dir.name}/SKILL.md`;
            const skillContent = await readFile(skillPath, 'utf8');
            
            // Parse SKILL.md frontmatter
            const skill = await this.parseSkillMetadata(dir.name, skillContent);
            if (skill) {
              localSkills.push({
                ...skill,
                id: `local_${dir.name}`,
                name: dir.name,
                author: 'openclaw',
                source: 'local',
                path: skillPath
              });
            }
          } catch (error) {
            // Skip skills without SKILL.md
          }
        }
      }
      
      logger.info(`📁 Found ${localSkills.length} local OpenClaw skills`);
      return localSkills;
      
    } catch (error) {
      logger.error('Failed to scan local skills:', error.message);
      return [];
    }
  }

  async parseSkillMetadata(skillName, content) {
    try {
      // Extract frontmatter if present
      const frontmatterMatch = content.match(/^---\n(.*?)\n---/s);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const lines = frontmatter.split('\n');
        const metadata = {};
        
        lines.forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            metadata[key.trim()] = valueParts.join(':').trim();
          }
        });
        
        return {
          description: metadata.description || `${skillName} skill`,
          version: '1.0.0',
          downloads: 0,
          last_updated: new Date(),
          tags: ['local', 'openclaw'],
          security_score: 85, // Local skills assumed safer
          verified: true,
          content: content
        };
      }
      
      return {
        description: `${skillName} skill`,
        version: '1.0.0',
        downloads: 0,
        last_updated: new Date(),
        tags: ['local', 'openclaw'],
        security_score: 85,
        verified: true,
        content: content
      };
      
    } catch (error) {
      logger.error(`Failed to parse skill metadata for ${skillName}:`, error.message);
      return null;
    }
  }

  async storeSkills(skills) {
    if (!skills || skills.length === 0) return;

    await transaction(async (client) => {
      for (const skill of skills) {
        // Store skill data
        await client.query(`
          INSERT INTO skills (
            external_id, name, author, version, downloads,
            description, tags, security_score, verified,
            source_url, metadata, last_updated, created_at
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (external_id) 
          DO UPDATE SET
            version = EXCLUDED.version,
            downloads = EXCLUDED.downloads,
            security_score = EXCLUDED.security_score,
            last_updated = EXCLUDED.last_updated,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          skill.id,
          skill.name,
          skill.author,
          skill.version,
          skill.downloads || 0,
          skill.description,
          JSON.stringify(skill.tags || []),
          skill.security_score || 0,
          skill.verified || false,
          skill.source_url,
          JSON.stringify({
            source: skill.source || 'clawdhub',
            path: skill.path,
            content_hash: skill.content ? createHash('sha256').update(skill.content).digest('hex') : null
          }),
          skill.last_updated
        ]);

        // Update skill cache for security analysis
        this.skillCache.set(skill.id, skill);
      }
    });

    // Create skills table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        author VARCHAR(255),
        version VARCHAR(50),
        downloads INTEGER DEFAULT 0,
        description TEXT,
        tags JSONB DEFAULT '[]',
        security_score FLOAT DEFAULT 0,
        verified BOOLEAN DEFAULT FALSE,
        source_url TEXT,
        metadata JSONB DEFAULT '{}',
        last_updated TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author);
      CREATE INDEX IF NOT EXISTS idx_skills_downloads ON skills(downloads);
      CREATE INDEX IF NOT EXISTS idx_skills_security_score ON skills(security_score);
    `);

    logger.debug(`💾 Stored ${skills.length} skills`);
  }

  async analyzeSkillSecurity(skills) {
    const { SecurityAnalyzer } = await import('../analyzers/security.js');
    const securityAnalyzer = new SecurityAnalyzer();
    
    for (const skill of skills) {
      try {
        if (skill.content) {
          // Analyze local skill content directly
          const analysis = await securityAnalyzer.analyzeContent(skill.content, skill.name);
          await this.storeSecurityAnalysis(skill, analysis);
        } else if (skill.source_url) {
          // Fetch and analyze remote skill
          const content = await this.fetchSkillContent(skill.source_url);
          if (content) {
            const analysis = await securityAnalyzer.analyzeContent(content, skill.name);
            await this.storeSecurityAnalysis(skill, analysis);
          }
        }
      } catch (error) {
        logger.warn(`Failed to analyze skill ${skill.name}:`, error.message);
      }
    }
  }

  async fetchSkillContent(sourceUrl) {
    try {
      // Try to fetch skill content from GitHub or other sources
      const response = await axios.get(sourceUrl, { timeout: 10000 });
      return response.data;
    } catch (error) {
      logger.debug(`Failed to fetch skill content from ${sourceUrl}: ${error.message}`);
      return null;
    }
  }

  async storeSecurityAnalysis(skill, analysis) {
    if (analysis.alerts && analysis.alerts.length > 0) {
      for (const alert of analysis.alerts) {
        await query(`
          INSERT INTO security_alerts (type, severity, title, description, metadata)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          alert.type,
          alert.severity,
          `${alert.severity.toUpperCase()}: ${skill.name} - ${alert.type}`,
          alert.description,
          JSON.stringify({
            ...alert,
            skill_id: skill.id,
            skill_name: skill.name,
            skill_author: skill.author
          })
        ]);
      }
    }
    
    // Update skill security score
    await query(`
      UPDATE skills 
      SET security_score = $1, updated_at = NOW()
      WHERE external_id = $2
    `, [analysis.overallScore, skill.id]);
  }

  async recordEcosystemMetrics(skills) {
    const metrics = {
      total_skills: skills.length,
      verified_skills: skills.filter(s => s.verified).length,
      average_security_score: skills.reduce((sum, s) => sum + (s.security_score || 0), 0) / skills.length,
      top_authors: this.getTopAuthors(skills),
      popular_tags: this.getPopularTags(skills),
      recent_activity: skills.filter(s => 
        new Date(s.last_updated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length
    };

    await query(`
      INSERT INTO analytics_snapshots (snapshot_type, data)
      VALUES ('clawdhub_ecosystem', $1)
    `, [JSON.stringify(metrics)]);

    logger.debug('📊 Recorded ClawdHub ecosystem metrics');
  }

  getTopAuthors(skills) {
    const authorStats = {};
    skills.forEach(skill => {
      if (!authorStats[skill.author]) {
        authorStats[skill.author] = { count: 0, total_downloads: 0 };
      }
      authorStats[skill.author].count++;
      authorStats[skill.author].total_downloads += skill.downloads || 0;
    });

    return Object.entries(authorStats)
      .sort((a, b) => b[1].total_downloads - a[1].total_downloads)
      .slice(0, 10)
      .map(([author, stats]) => ({ author, ...stats }));
  }

  getPopularTags(skills) {
    const tagCounts = {};
    skills.forEach(skill => {
      (skill.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));
  }

  isNewSkill(skill) {
    const cached = this.skillCache.get(skill.id);
    return !cached || cached.version !== skill.version;
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      requestCount: this.requestCount,
      lastCollectionTime: this.lastCollectionTime,
      skillsCached: this.skillCache.size
    };
  }
}

export default ClawdHubCollector;