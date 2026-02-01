import logger from '../utils/logger.js';
import MoltbookCollector from './moltbook.js';

const collectors = [];

export async function startCollectors() {
  try {
    logger.info('🔄 Starting data collectors...');

    // Initialize Moltbook collector
    const moltbookCollector = new MoltbookCollector();
    await moltbookCollector.start();
    collectors.push(moltbookCollector);

    logger.info(`✅ Started ${collectors.length} collectors`);
  } catch (error) {
    logger.error('❌ Failed to start collectors:', error);
    throw error;
  }
}

export async function stopCollectors() {
  logger.info('🛑 Stopping data collectors...');
  
  for (const collector of collectors) {
    try {
      await collector.stop();
    } catch (error) {
      logger.error('Error stopping collector:', error);
    }
  }
  
  collectors.length = 0;
  logger.info('✅ All collectors stopped');
}

export function getCollectorStats() {
  return collectors.map(collector => ({
    name: collector.constructor.name,
    stats: collector.getStats ? collector.getStats() : {}
  }));
}