
import { createAIServiceFromEnv } from '../server/services/AIService';

console.log('Attempting to import and create AIService...');

try {
    createAIServiceFromEnv();
    console.log('AIService created successfully!');
} catch (error) {
    console.error('Failed to create AIService:', error);
    process.exit(1);
}
