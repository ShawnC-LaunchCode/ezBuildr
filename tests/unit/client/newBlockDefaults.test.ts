import { describe, expect, it } from 'vitest';

import {
    NEW_BLOCK_DEFAULTS,
    type LogicBlockType,
} from '../../../client/src/components/builder/pages/newBlockDefaults';

/**
 * LIST-B16. The seeds are type-annotated now, so tsc is the primary guard —
 * but a config type with every field optional would let a wrong key back in
 * silently, and `ListToolsConfig`'s optional half is large. These assertions
 * are about the two fields that must be *present*, and about the three dead
 * keys the old seed left behind.
 */
describe('NEW_BLOCK_DEFAULTS', () => {
    const menuTypes: LogicBlockType[] = ['read_table', 'write', 'external_send', 'list_tools'];

    it('has an entry for every type the Add Action menu offers', () => {
        expect(Object.keys(NEW_BLOCK_DEFAULTS).sort()).toEqual([...menuTypes].sort());
    });

    it('seeds a list_tools block with the fields ListToolsConfig actually has', () => {
        const { config } = NEW_BLOCK_DEFAULTS.list_tools;

        expect(config.sourceListVar).toBe('');
        expect(config.outputListVar).toBe('processed_list');
    });

    it('seeds no key that ListToolsConfig does not define', () => {
        // The regression: `{ inputKey, operation, outputKey }` — three keys the
        // runner and the editor both ignore, which also left the block's virtual
        // step with no alias because the service reads `config.outputListVar`.
        const allowed = new Set([
            'sourceListVar', 'outputListVar', 'filters', 'sort', 'limit',
            'offset', 'select', 'dedupe', 'outputs', 'runCondition',
        ]);

        for (const key of Object.keys(NEW_BLOCK_DEFAULTS.list_tools.config)) {
            expect(allowed, `unexpected list_tools config key "${key}"`).toContain(key);
        }
    });

    it('names an output variable for every block whose output is a variable', () => {
        // read_table and list_tools both alias a virtual step from their config;
        // an empty name there is what leaves the output unaddressable.
        expect(NEW_BLOCK_DEFAULTS.read_table.config.outputKey).toBeTruthy();
        expect(NEW_BLOCK_DEFAULTS.list_tools.config.outputListVar).toBeTruthy();
    });

    it('keeps the phase each block type was created in', () => {
        expect(NEW_BLOCK_DEFAULTS.read_table.phase).toBe('onPageEnter');
        expect(NEW_BLOCK_DEFAULTS.write.phase).toBe('onPageSubmit');
        expect(NEW_BLOCK_DEFAULTS.external_send.phase).toBe('onPageSubmit');
        expect(NEW_BLOCK_DEFAULTS.list_tools.phase).toBe('onPageSubmit');
    });
});
