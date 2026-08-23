
import { eq } from 'drizzle-orm';

import { db, dbInitPromise } from '../server/db';
import { pageRepository } from '../server/repositories';
import { readTableBlockService } from '../server/services/ReadTableBlockService';
import { pages } from '../shared/schema';

async function testReadBlockCreation() {
    await dbInitPromise;

    const workflowId = 'dbba5c75-5670-4036-af21-c6a219dc0515';
    const userId = 'test-user-runs-stage8';

    try {
        // Check if page exists
        const existingPages = await db.select().from(pages).where(eq(pages.workflowId, workflowId));

        let pageId;
        if (existingPages.length > 0) {
            pageId = existingPages[0].id;
        } else {
            console.log('Creating logic page...');
            const page = await pageRepository.create({
                workflowId,
                title: 'Test Page',
                order: 0
            });
            pageId = page.id;
        }

        const block = await readTableBlockService.createBlock(workflowId, userId, {
            name: 'Test Read Block',
            pageId,
            phase: 'onRunStart',
            config: {
                dataSourceId: 'some-ds-id',
                tableId: 'some-table-id',
                // @ts-expect-error - TODO: fix type
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
