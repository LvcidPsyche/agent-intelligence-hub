#!/usr/bin/env node

import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { connectDatabase, initializeSchema } from '../src/utils/database.js';
import logger from '../src/utils/logger.js';

dotenv.config();

async function setup() {
  try {
    logger.info('🔧 Starting Agent Intelligence Hub setup...');
    
    // Check environment variables
    const requiredVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'MOLTBOOK_API_KEY'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`);
      logger.info('Please copy .env.example to .env and fill in the values');
      process.exit(1);
    }
    
    // Connect to database
    logger.info('📊 Connecting to database...');
    await connectDatabase();
    
    // Initialize schema
    logger.info('📋 Initializing database schema...');
    await initializeSchema();
    
    // Create logs directory
    logger.info('📝 Setting up logging...');
    const { mkdir } = await import('fs/promises');
    try {
      await mkdir('logs', { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    logger.info('✅ Setup completed successfully!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Run: npm run dev');
    logger.info('2. Visit: http://localhost:3000/health');
    logger.info('3. Check API: http://localhost:3000/api/v1');
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

setup();