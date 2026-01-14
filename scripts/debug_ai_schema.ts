
import { z } from 'zod';
import { AIWorkflowRevisionResponseSchema } from '../shared/types/ai';

const mockResponse = {
    updatedWorkflow: {
        title: 'Revised Flow',
        sections: [{ id: 's1', title: 'Start', order: 0, steps: [] }],
        logicRules: [],
        transformBlocks: []
    },
    diff: { changes: [{ type: 'add', target: 'sections', explanation: 'Added new section' }] },
    explanation: ['I did good.']
};

try {
    console.log('Validating mock response...');
    AIWorkflowRevisionResponseSchema.parse(mockResponse);
    console.log('Validation SUCCESS!');
} catch (error) {
    console.error('Validation FAILED:');
    if (error instanceof z.ZodError) {
        console.error(JSON.stringify(error.issues, null, 2));
    } else {
        console.error(error);
    }
}
