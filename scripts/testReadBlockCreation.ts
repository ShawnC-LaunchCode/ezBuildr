
import { eq } from 'drizzle-orm';

import { db, dbInitPromise } from '../server/db';
import { sectionRepository } from '../server/repositories';
import { readTableBlockService } from '../server/services/ReadTableBlockService';
import { sections } from '../shared/schema';

async function testReadBlockCreation() {
    await dbInitPromise;

    const workflowId = 'dbba5c75-5670-4036-af21-c6a219dc0515';
    const userId = 'test-user-runs-stage8';

    try {
        // Check if section exists
        const existingSections = await db.select().from(sections).where(eq(sections.workflowId, workflowId));

        let sectionId;
        if (existingSections.length > 0) {
            sectionId = existingSections[0].id;
        } else {
            console.log('Creating logic section...');
            const section = await sectionRepository.create({
                workflowId,
                title: 'Test Section',
                order: 0
            });
            sectionId = section.id;
        }

        const block = await readTableBlockService.createBlock(workflowId, userId, {
            name: 'Test Read Block',
            sectionId,
            phase: 'onRunStart',
            config: {
                dataSourceId: 'some-ds-id',
                tableId: 'some-table-id',
                resultMode: 'single',
                outputKey: 'testOutput',
                matchStrategy: 'first',
                selectedColumnIds: [],
                selectAllColumns: true
            }
        });

        console.log('Successfully created block:', block.id);
    } catch (error) {
        console.error('Error creating block:', error);
    }
}

testReadBlockCreation();
