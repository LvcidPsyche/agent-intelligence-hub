import logger from '../utils/logger.js';
import SecurityAnalyzer from './security.js';
import ThreatIntelligenceAnalyzer from './threat_intelligence.js';
import NetworkAnalyzer from './network_analyzer.js';
import IdentityResolver from './identity_resolution.js';
import ReputationEngine from './reputation_engine.js';

const analyzers = [];

export async function startAnalyzers() {
  try {
    logger.info('🧠 Starting data analyzers...');

    // Initialize Security analyzer
    const securityAnalyzer = new SecurityAnalyzer();
    await securityAnalyzer.start();
    analyzers.push(securityAnalyzer);

    // Initialize Threat Intelligence analyzer
    const threatIntelAnalyzer = new ThreatIntelligenceAnalyzer();
    await threatIntelAnalyzer.start();
    analyzers.push(threatIntelAnalyzer);

    // Initialize Network analyzer
    const networkAnalyzer = new NetworkAnalyzer();
    await networkAnalyzer.start();
    analyzers.push(networkAnalyzer);

    // Initialize Identity Resolver (link cross-platform accounts)
    const identityResolver = new IdentityResolver();
    analyzers.push(identityResolver);

    // Initialize Reputation Engine (calculate agent scores)
    const reputationEngine = new ReputationEngine();
    analyzers.push(reputationEngine);

    logger.info(`✅ Started ${analyzers.length} analyzers`);
  } catch (error) {
    logger.error('❌ Failed to start analyzers:', error);
    throw error;
  }
}

export async function stopAnalyzers() {
  logger.info('🛑 Stopping data analyzers...');
  
  for (const analyzer of analyzers) {
    try {
      await analyzer.stop();
    } catch (error) {
      logger.error('Error stopping analyzer:', error);
    }
  }
  
  analyzers.length = 0;
  logger.info('✅ All analyzers stopped');
}

export function getAnalyzerStats() {
  return analyzers.map(analyzer => ({
    name: analyzer.constructor.name,
    stats: analyzer.getStats ? analyzer.getStats() : {}
  }));
}