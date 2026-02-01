import logger from '../utils/logger.js';
import SecurityAnalyzer from './security.js';

const analyzers = [];

export async function startAnalyzers() {
  try {
    logger.info('🧠 Starting data analyzers...');

    // Initialize Security analyzer
    const securityAnalyzer = new SecurityAnalyzer();
    await securityAnalyzer.start();
    analyzers.push(securityAnalyzer);

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