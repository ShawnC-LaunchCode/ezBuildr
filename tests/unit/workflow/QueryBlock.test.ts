import { describe, it, expect } from 'vitest';
import { repeaterService } from '../../../server/services/RepeaterService';
import type { ListVariable } from '@shared/types/query';

describe('RepeaterService List Integration', () => {
    const mockListVariable: ListVariable = {
        id: 'list-123',
        name: 'My List',
        tableId: 'table-123',
        rows: [
            { id: 'row-1', name: 'Alice', age: 30 },
            { id: 'row-2', name: 'Bob', age: 25 },
        ],
        rowCount: 2,
        columnIds: ['col-name', 'col-age']
    };

    it('should create instances from ListVariable', () => {
        const config = {
            fields: [
                { id: 'param1', type: 'short_text' as const, alias: 'name', order: 0, title: 'Name' },
                { id: 'param2', type: 'short_text' as const, alias: 'age', order: 1, title: 'Age' }
            ],
            maxInstances: 5,
            listSource: 'myList'
        };

        const result = repeaterService.createFromList(mockListVariable, config);

        expect(result.instances).toHaveLength(2);
        expect(result.instances[0].values).toEqual({ param1: 'Alice', param2: 30 });
        expect(result.instances[1].values).toEqual({ param1: 'Bob', param2: 25 });
        expect(result.instances[0].index).toBe(0);
        expect(result.instances[1].index).toBe(1);
    });

    it('should respect maxInstances with list', () => {
        const config = {
            fields: [],
            maxInstances: 1
        };
        const result = repeaterService.createFromList(mockListVariable, config);
        expect(result.instances).toHaveLength(1);
    });

    it('should handle empty list', () => {
        const emptyList = { ...mockListVariable, rows: [], rowCount: 0 };
        const config = { fields: [] };
        const result = repeaterService.createFromList(emptyList, config);
        expect(result.instances).toHaveLength(0);
    });
});
