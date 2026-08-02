import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { collectConfigEntityRefs } from '@shared/types/stepConfigRefs';

/**
 * IEX3-2. The collector is what stops a DataVault-bound question from
 * importing as a silently broken dropdown, so the two properties that matter
 * are: it finds a reference at any depth, and it never reports a local id.
 */
describe('collectConfigEntityRefs', () => {
  const dbId = randomUUID();
  const tableId = randomUUID();
  const columnId = randomUUID();

  function tableColumnChoice(): Record<string, unknown> {
    return {
      display: 'dropdown',
      options: [],
      dynamicOptions: {
        type: 'table_column',
        dataSourceId: dbId,
        tableId,
        columnId,
      },
    };
  }

  it('finds the three ids of a table-column choice binding', () => {
    const refs = collectConfigEntityRefs(tableColumnChoice());

    expect(refs).toEqual([
      { path: 'config.dynamicOptions.dataSourceId', id: dbId, entity: 'datavault_databases' },
      { path: 'config.dynamicOptions.tableId', id: tableId, entity: 'datavault_tables' },
      { path: 'config.dynamicOptions.columnId', id: columnId, entity: 'datavault_columns' },
    ]);
  });

  it('finds a binding nested inside a List field', () => {
    const listConfig = {
      fields: [
        { kind: 'question', id: randomUUID(), alias: 'name', type: 'text', title: 'Name', order: 0 },
        {
          kind: 'question', id: randomUUID(), alias: 'state', type: 'choice',
          title: 'State', order: 1, config: tableColumnChoice(),
        },
      ],
    };

    const refs = collectConfigEntityRefs(listConfig);

    expect(refs.map(r => r.path)).toEqual([
      'config.fields[1].config.dynamicOptions.dataSourceId',
      'config.fields[1].config.dynamicOptions.tableId',
      'config.fields[1].config.dynamicOptions.columnId',
    ]);
    expect(refs.map(r => r.id)).toEqual([dbId, tableId, columnId]);
  });

  it('recurses through a List nested inside a List', () => {
    const listConfig = {
      fields: [
        {
          kind: 'list', id: randomUUID(), alias: 'addresses', title: 'Addresses', order: 0,
          list: {
            fields: [
              { kind: 'question', id: randomUUID(), alias: 'street', type: 'text', title: 'Street', order: 0 },
              {
                kind: 'question', id: randomUUID(), alias: 'state', type: 'choice',
                title: 'State', order: 1, config: tableColumnChoice(),
              },
            ],
          },
        },
      ],
    };

    const refs = collectConfigEntityRefs(listConfig);

    expect(refs.map(r => r.path)).toEqual([
      'config.fields[0].list.fields[1].config.dynamicOptions.dataSourceId',
      'config.fields[0].list.fields[1].config.dynamicOptions.tableId',
      'config.fields[0].list.fields[1].config.dynamicOptions.columnId',
    ]);
  });

  it('finds template references on a final_documents config', () => {
    const templateA = randomUUID();
    const templateB = randomUUID();
    const config = {
      markdownHeader: 'Your documents',
      documents: [
        { id: randomUUID(), documentId: templateA, alias: 'contract' },
        { id: randomUUID(), documentId: templateB, alias: 'receipt' },
      ],
    };

    const refs = collectConfigEntityRefs(config);

    expect(refs).toEqual([
      { path: 'config.documents[0].documentId', id: templateA, entity: 'templates' },
      { path: 'config.documents[1].documentId', id: templateB, entity: 'templates' },
    ]);
  });

  it('finds references in block configs and their nested arrays', () => {
    const filterColumn = randomUUID();
    const mappedColumn = randomUUID();
    const config = {
      dataSourceId: dbId,
      tableId,
      mode: 'upsert',
      matchStrategy: { type: 'column_match', columnId: filterColumn },
      columnMappings: [{ columnId: mappedColumn, value: '{{name}}' }],
    };

    const refs = collectConfigEntityRefs(config);

    expect(refs.map(r => [r.path, r.entity])).toEqual([
      ['config.dataSourceId', 'datavault_databases'],
      ['config.tableId', 'datavault_tables'],
      ['config.matchStrategy.columnId', 'datavault_columns'],
      ['config.columnMappings[0].columnId', 'datavault_columns'],
    ]);
  });

  // The reason this is an allowlist rather than a UUID regex. Every `id` below
  // is UUID-shaped and local to the config; reporting any of them would make
  // the import warning noise, and a noisy warning is an ignored warning.
  it('never reports locally-scoped ids, even when they are UUID-shaped', () => {
    const config = {
      display: 'radio',
      // ChoiceOption.id
      options: [
        { id: randomUUID(), label: 'Yes', value: 'yes' },
        { id: randomUUID(), label: 'No', value: 'no' },
      ],
      // ListField.id and documents[].id
      fields: [
        { kind: 'question', id: randomUUID(), alias: 'a', type: 'text', title: 'A', order: 0 },
      ],
      documents: [{ id: randomUUID(), alias: 'contract' }],
      // Not an entity reference either: a list variable name and field paths.
      dynamicOptions: {
        type: 'list',
        listVariable: 'usersList',
        labelPath: 'user.fullName',
        valuePath: 'user.id',
      },
    };

    expect(collectConfigEntityRefs(config)).toEqual([]);
  });

  it('ignores empty strings, nulls and non-config values', () => {
    expect(collectConfigEntityRefs(null)).toEqual([]);
    expect(collectConfigEntityRefs(undefined)).toEqual([]);
    expect(collectConfigEntityRefs('a string')).toEqual([]);
    expect(collectConfigEntityRefs({ tableId: '' })).toEqual([]);
    expect(collectConfigEntityRefs({ tableId: null })).toEqual([]);
  });

  it('uses the supplied base path so callers can name the column', () => {
    const refs = collectConfigEntityRefs({ tableId }, 'config');
    expect(refs[0].path).toBe('config.tableId');
  });
});
