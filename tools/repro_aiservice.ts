
import { createAIServiceFromEnv } from '../server/services/AIService';
import { logger } from '../server/logger';

console.log('Attempting to import and create AIService...');

try {
    const service = createAIServiceFromEnv();
    console.log('AIService created successfully!');
} catch (error) {
    console.error('Failed to create AIService:', error);
    process.exit(1);
}
