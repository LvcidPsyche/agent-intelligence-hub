import logger from '../utils/logger.js';
import MoltbookCollector from './moltbook.js';
import MoltxCollector from './moltx.js';
import ClawhCanCollector from './4claw.js';
import ClawdHubCollector from './clawdhub.js';

const collectors = [];

export async function startCollectors() {
  try {
    logger.info('🔄 Starting data collectors...');

    // Initialize Moltbook collector (posts, karma, activity)
    const moltbookCollector = new MoltbookCollector();
    await moltbookCollector.start();
    collectors.push(moltbookCollector);

    // Initialize Moltx collector (posts, engagement, following)
    const moltxCollector = new MoltxCollector();
    await moltxCollector.start();
    collectors.push(moltxCollector);

    // Initialize 4claw collector (threads, sentiment, community)
    const clawhCanCollector = new ClawhCanCollector();
    await clawhCanCollector.start();
    collectors.push(clawhCanCollector);

    // Initialize ClawdHub collector (skills, security)
    const clawdhubCollector = new ClawdHubCollector();
    await clawdhubCollector.start();
    collectors.push(clawdhubCollector);

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