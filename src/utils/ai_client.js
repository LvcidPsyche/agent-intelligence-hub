import axios from 'axios';
import logger from './logger.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const API_BASE_URL = 'https://api.anthropic.com/v1';

// Model selection based on task complexity and cost optimization
const MODELS = {
  haiku: 'claude-3-haiku-20240307',     // $1/$5 per MTok - simple tasks
  sonnet: 'claude-3-sonnet-20240229',   // $3/$15 per MTok - balanced
  opus: 'claude-3-opus-20240229'        // $15/$75 per MTok - complex only
};

// Cached system prompts to achieve 90% cost reduction
const CACHED_SYSTEM_PROMPTS = {
  security_analysis: {
    text: `You are a cybersecurity analyst. Analyze code/skills for security issues:
- Credential access (API keys, passwords, env vars)
- File system operations (read/write sensitive files) 
- Network requests (external calls, webhooks)
- Code execution (eval, exec, spawn)
- Input validation issues

Return JSON only: {"alerts": [{"type": "string", "severity": "low|medium|high", "description": "string", "line": number}], "overallScore": 0-100}`,
    cache_control: { type: "ephemeral" }
  },
  
  threat_intelligence: {
    text: `You are a threat intelligence analyst. Assess agent behavior risks:
- Rapid skill creation patterns
- Credential harvesting attempts
- Network scanning behavior
- Social engineering indicators
- Supply chain risks

Return JSON: {"risk_score": 0-1, "threat_type": "string", "indicators": ["strings"], "confidence": 0-1}`,
    cache_control: { type: "ephemeral" }
  },
  
  network_analysis: {
    text: `You are a network analyst. Extract agent relationships and patterns:
- Collaboration indicators
- Communication patterns  
- Influence relationships
- Community structures

Return JSON: {"connections": [{"source": "id", "target": "id", "type": "string", "strength": 0-1}], "communities": [{"agents": ["ids"], "type": "string"}]}`,
    cache_control: { type: "ephemeral" }
  }
};

// Token limits for different task types (cost control)
const TOKEN_LIMITS = {
  classification: 100,
  security_scan: 300,
  threat_analysis: 500,
  network_analysis: 800,
  detailed_report: 1500,
  complex_reasoning: 3000
};

class AIClient {
  constructor() {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.cacheHitRate = 0;
    this.modelUsageStats = {
      haiku: 0,
      sonnet: 0,
      opus: 0
    };
  }

  /**
   * Smart model selection based on task complexity and cost optimization
   */
  selectModel(taskType, contentLength = 0, complexity = 'simple') {
    // Route 90% of tasks to Haiku for cost optimization
    if (taskType === 'classification' || 
        taskType === 'extraction' || 
        taskType === 'security_scan' ||
        complexity === 'simple' ||
        contentLength < 5000) {
      return MODELS.haiku;
    }
    
    // Use Sonnet for balanced performance needs
    if (taskType === 'analysis' || 
        taskType === 'threat_analysis' ||
        complexity === 'medium' ||
        contentLength < 20000) {
      return MODELS.sonnet;
    }
    
    // Reserve Opus for only the most complex tasks
    if (complexity === 'high' || contentLength > 20000) {
      logger.warn('Using expensive Opus model', { taskType, contentLength, complexity });
      return MODELS.opus;
    }
    
    return MODELS.haiku; // Default to cheapest
  }

  /**
   * Optimized API call with caching and model routing
   */
  async generateResponse(taskType, content, options = {}) {
    const {
      systemPromptKey,
      complexity = 'simple',
      maxTokens,
      useCache = true,
      batchable = false
    } = options;

    // Select optimal model for cost efficiency
    const model = this.selectModel(taskType, content.length, complexity);
    this.modelUsageStats[model.includes('haiku') ? 'haiku' : 
                       model.includes('sonnet') ? 'sonnet' : 'opus']++;

    // Use cached system prompt if available
    const systemPrompt = systemPromptKey && CACHED_SYSTEM_PROMPTS[systemPromptKey] 
      ? CACHED_SYSTEM_PROMPTS[systemPromptKey] 
      : null;

    // Set appropriate token limits for cost control
    const tokenLimit = maxTokens || TOKEN_LIMITS[taskType] || TOKEN_LIMITS.classification;

    try {
      const payload = {
        model: model,
        max_tokens: tokenLimit,
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      };

      // Add cached system prompt if available
      if (systemPrompt) {
        payload.system = [
          {
            type: 'text',
            text: systemPrompt.text,
            cache_control: systemPrompt.cache_control
          }
        ];
      }

      this.requestCount++;
      const startTime = Date.now();

      const response = await axios.post(`${API_BASE_URL}/messages`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      });

      const duration = Date.now() - startTime;
      
      // Track usage statistics for cost monitoring
      const usage = response.data.usage;
      this.totalTokensUsed += (usage.input_tokens + usage.output_tokens);
      
      // Calculate cache hit rate
      if (usage.cache_read_input_tokens > 0) {
        this.cacheHitRate = (this.cacheHitRate + 1) / this.requestCount;
      }

      logger.debug('AI API call completed', {
        model: model,
        taskType: taskType,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        duration: duration,
        cost: this.estimateCost(model, usage)
      });

      return {
        content: response.data.content[0].text,
        usage: usage,
        model: model,
        cached: (usage.cache_read_input_tokens > 0)
      };

    } catch (error) {
      logger.error('AI API call failed', {
        model: model,
        taskType: taskType,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new Error(`AI API call failed: ${error.message}`);
    }
  }

  /**
   * Batch processing for non-urgent tasks (50% cost discount)
   */
  async submitBatchJob(requests, options = {}) {
    const { 
      completionWindow = '24h',
      metadata = {} 
    } = options;

    try {
      const batchPayload = {
        completion_window: completionWindow,
        requests: requests,
        metadata: metadata
      };

      const response = await axios.post(`${API_BASE_URL}/batches`, batchPayload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      });

      logger.info('Batch job submitted', {
        batchId: response.data.id,
        requestCount: requests.length,
        estimatedSavings: '50%'
      });

      return response.data;

    } catch (error) {
      logger.error('Batch job submission failed', {
        error: error.message,
        requestCount: requests.length
      });
      throw error;
    }
  }

  /**
   * Check batch job status
   */
  async getBatchJobStatus(batchId) {
    try {
      const response = await axios.get(`${API_BASE_URL}/batches/${batchId}`, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get batch status', { batchId, error: error.message });
      throw error;
    }
  }

  /**
   * Estimate API cost based on model and usage
   */
  estimateCost(model, usage) {
    const pricing = {
      'claude-3-haiku-20240307': { input: 1, output: 5 },
      'claude-3-sonnet-20240229': { input: 3, output: 15 },
      'claude-3-opus-20240229': { input: 15, output: 75 }
    };

    const modelPricing = pricing[model] || pricing['claude-3-haiku-20240307'];
    
    // Calculate cost in dollars (pricing is per million tokens)
    const inputCost = (usage.input_tokens / 1000000) * modelPricing.input;
    const outputCost = (usage.output_tokens / 1000000) * modelPricing.output;
    
    // Cache reads are 10% of normal input cost (90% savings)
    const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1000000) * modelPricing.input * 0.1;
    
    return inputCost + outputCost + cacheReadCost;
  }

  /**
   * Get usage statistics for monitoring
   */
  getUsageStats() {
    return {
      totalRequests: this.requestCount,
      totalTokensUsed: this.totalTokensUsed,
      cacheHitRate: this.cacheHitRate,
      modelUsage: this.modelUsageStats,
      estimatedMonthlyCost: this.estimateMonthlySpend()
    };
  }

  estimateMonthlySpend() {
    // Rough estimate based on current usage patterns
    const dailyTokens = this.totalTokensUsed; // Assumes 1 day of operation
    const monthlyTokens = dailyTokens * 30;
    
    // Weighted average cost assuming 80% Haiku, 15% Sonnet, 5% Opus
    const avgInputCost = (0.8 * 1) + (0.15 * 3) + (0.05 * 15); // $1.65/MTok
    const avgOutputCost = (0.8 * 5) + (0.15 * 15) + (0.05 * 75); // $10.05/MTok
    
    return {
      monthlyTokens: monthlyTokens,
      estimatedCost: (monthlyTokens / 1000000) * ((avgInputCost + avgOutputCost) / 2),
      optimizationSavings: '85%' // Compared to using only Sonnet
    };
  }
}

export default AIClient;