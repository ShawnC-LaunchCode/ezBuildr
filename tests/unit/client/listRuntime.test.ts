/**
 * LIST-8 — pure runtime helpers behind the runner's List block: item CRUD,
 * label/summary resolution, and path-based reads/writes through an
 * arbitrarily nested drill stack (children -> addresses -> occupants, the
 * initiative's canonical 3-level example).
 */
import { describe, it, expect } from 'vitest';

import {
  addItem,
  countNestedItemsRecursive,
  createItemValues,
  describeNestedCounts,
  emptyListValue,
  normalizeListValue,
  removeItem,
  reorderItems,
  resolveBreadcrumbLabels,
  resolveDrillScope,
  resolveItemLabel,
  setFieldValueAtScope,
  type DrillSegment,
} from '../../../client/src/components/runner/list/listRuntime';

import type { ListConfig, ListItem, ListValue } from '../../../shared/types/stepConfigs';

const addressesField = {
  kind: 'list' as const,
  id: 'f-addresses',
  alias: 'addresses',
  title: 'Addresses',
  order: 1,
  list: {
    fields: [
      { kind: 'question' as const, id: 'f-street', alias: 'street', type: 'short_text' as const, title: 'Street', order: 0 },
      {
        kind: 'list' as const,
        id: 'f-occupants',
        alias: 'occupants',
        title: 'Occupants',
        order: 1,
        list: {
          fields: [
            { kind: 'question' as const, id: 'f-occname', alias: 'occName', type: 'short_text' as const, title: 'Occupant', order: 0 },
          ],
        },
      },
    ],
  },
};

const childrenConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    addressesField,
  ],
  labelTemplate: '{name}',
};

function makeItem(itemId: string, values: Record<string, unknown>): ListItem {
  return { itemId, values };
}

describe('emptyListValue / normalizeListValue', () => {
  it('returns an empty items array', () => {
    expect(emptyListValue()).toEqual({ items: [] });
  });

  it('normalizes null/undefined/malformed values to empty', () => {
    expect(normalizeListValue(null)).toEqual({ items: [] });
    expect(normalizeListValue(undefined)).toEqual({ items: [] });
    expect(normalizeListValue('not a list')).toEqual({ items: [] });
    expect(normalizeListValue({ notItems: [] })).toEqual({ items: [] });
  });

  it('passes through a well-formed ListValue', () => {
    const value: ListValue = { items: [makeItem('a', { name: 'Ava' })] };
    expect(normalizeListValue(value)).toBe(value);
  });
});

describe('createItemValues', () => {
  it('defaults nested list fields to { items: [] }, not absent (LIST-3 rejects absent nested lists)', () => {
    const values = createItemValues(childrenConfig);
    expect(values.name).toBeUndefined();
    expect(values.addresses).toEqual({ items: [] });
  });
});

describe('addItem / removeItem / reorderItems', () => {
  it('addItem appends a new item with a stable itemId and initialized nested lists', () => {
    const { value, item } = addItem(emptyListValue(), childrenConfig);
    expect(value.items).toHaveLength(1);
    expect(value.items[0].itemId).toBe(item.itemId);
    expect(value.items[0].values.addresses).toEqual({ items: [] });
  });

  it('removeItem drops only the matching item', () => {
    const value: ListValue = { items: [makeItem('a', {}), makeItem('b', {})] };
    expect(removeItem(value, 'a').items.map((i) => i.itemId)).toEqual(['b']);
  });

  it('reorderItems moves an item and leaves the rest in relative order', () => {
    const value: ListValue = { items: [makeItem('a', {}), makeItem('b', {}), makeItem('c', {})] };
    expect(reorderItems(value, 0, 2).items.map((i) => i.itemId)).toEqual(['b', 'c', 'a']);
  });
});

describe('resolveItemLabel', () => {
  it('resolves {alias} against the item\'s own values', () => {
    const item = makeItem('a', { name: 'Ava Chen' });
    expect(resolveItemLabel(item, childrenConfig, 'fallback')).toBe('Ava Chen');
  });

  it('falls back when the template is unset', () => {
    const item = makeItem('a', { name: 'Ava' });
    const noTemplateConfig: ListConfig = { fields: childrenConfig.fields };
    expect(resolveItemLabel(item, noTemplateConfig, 'Item 1')).toBe('Item 1');
  });

  it('falls back when the template resolves blank (field unanswered)', () => {
    const item = makeItem('a', {});
    expect(resolveItemLabel(item, childrenConfig, 'Item 1')).toBe('Item 1');
  });

  it('never inlines a nested list/object value into the label', () => {
    const item = makeItem('a', { name: '', addresses: { items: [{ itemId: 'x', values: {} }] } });
    const template: ListConfig = { fields: childrenConfig.fields, labelTemplate: '{addresses}' };
    expect(resolveItemLabel(item, template, 'Item 1')).toBe('Item 1');
  });
});

describe('describeNestedCounts / countNestedItemsRecursive', () => {
  it('describes each nested list field\'s count (AC: delete-confirm names what is lost)', () => {
    const item = makeItem('a', {
      name: 'Ava',
      addresses: { items: [makeItem('addr-1', { street: '1 Oak St' }), makeItem('addr-2', { street: '2 Elm St' })] },
    });
    expect(describeNestedCounts(item, childrenConfig)).toBe('2 addresses');
  });

  it('returns null when the item has no nested list fields at all', () => {
    const flatConfig: ListConfig = { fields: [{ kind: 'question', id: 'f', alias: 'x', type: 'short_text', title: 'X', order: 0 }] };
    expect(describeNestedCounts(makeItem('a', { x: '1' }), flatConfig)).toBeNull();
  });

  it('counts nested items recursively through a 3rd level', () => {
    const item = makeItem('a', {
      name: 'Ava',
      addresses: {
        items: [
          makeItem('addr-1', {
            street: '1 Oak St',
            occupants: { items: [makeItem('occ-1', { occName: 'Sam' }), makeItem('occ-2', { occName: 'Lee' })] },
          }),
        ],
      },
    });
    // 1 address + 2 occupants inside it = 3
    expect(countNestedItemsRecursive(item, childrenConfig)).toBe(3);
  });
});

describe('resolveDrillScope', () => {
  const rootValue: ListValue = {
    items: [
      {
        itemId: 'ava',
        values: {
          name: 'Ava',
          addresses: {
            items: [
              {
                itemId: 'addr-1',
                values: {
                  street: '1 Oak St',
                  occupants: { items: [{ itemId: 'occ-1', values: { occName: 'Sam' } }] },
                },
              },
            ],
          },
        },
      },
    ],
  };

  it('resolves the top-level scope for a single-segment stack', () => {
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Ava' }];
    const scope = resolveDrillScope(childrenConfig, rootValue, segments);
    expect(scope?.config).toBe(childrenConfig);
    expect(scope?.item.itemId).toBe('ava');
  });

  it('resolves a 2nd-level scope (into a nested list field)', () => {
    const segments: DrillSegment[] = [
      { fieldAlias: null, itemId: 'ava', label: 'Ava' },
      { fieldAlias: 'addresses', itemId: 'addr-1', label: '1 Oak St' },
    ];
    const scope = resolveDrillScope(childrenConfig, rootValue, segments);
    expect(scope?.config).toBe(addressesField.list);
    expect(scope?.item.itemId).toBe('addr-1');
  });

  it('resolves a 3rd-level scope (children -> addresses -> occupants)', () => {
    const segments: DrillSegment[] = [
      { fieldAlias: null, itemId: 'ava', label: 'Ava' },
      { fieldAlias: 'addresses', itemId: 'addr-1', label: '1 Oak St' },
      { fieldAlias: 'occupants', itemId: 'occ-1', label: 'Sam' },
    ];
    const scope = resolveDrillScope(childrenConfig, rootValue, segments);
    expect(scope?.item.itemId).toBe('occ-1');
    expect(scope?.item.values.occName).toBe('Sam');
  });

  it('returns null when an item in the stack no longer exists (deleted from under it)', () => {
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'missing', label: 'Ghost' }];
    expect(resolveDrillScope(childrenConfig, rootValue, segments)).toBeNull();
  });

  it('returns null when the stack references a field that is no longer a list field', () => {
    const segments: DrillSegment[] = [
      { fieldAlias: null, itemId: 'ava', label: 'Ava' },
      { fieldAlias: 'name', itemId: 'addr-1', label: 'bogus' },
    ];
    expect(resolveDrillScope(childrenConfig, rootValue, segments)).toBeNull();
  });
});

describe('resolveBreadcrumbLabels', () => {
  it('resolves each segment\'s CURRENT label, not the frozen segment.label captured at drill-in time', () => {
    // Regression: the item was drilled into before "name" was typed, so
    // segment.label is stuck at the "Item 1" placeholder from creation —
    // the breadcrumb must reflect the name once it exists.
    const rootValue: ListValue = {
      items: [{ itemId: 'ava', values: { name: 'Ava Chen', addresses: { items: [] } } }],
    };
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Item 1' }];

    expect(resolveBreadcrumbLabels(childrenConfig, rootValue, segments)).toEqual(['Ava Chen']);
  });

  it('resolves labels at every level of a 3-level stack (using each level\'s own labelTemplate)', () => {
    // A level with no labelTemplate of its own always falls back to
    // segment.label — only childrenConfig's root has one by default, so
    // give the nested levels their own to exercise "every level" for real.
    const configWithNestedTemplates: ListConfig = {
      ...childrenConfig,
      fields: [
        childrenConfig.fields[0],
        {
          ...addressesField,
          list: { ...addressesField.list, labelTemplate: '{street}' },
        },
      ],
    };

    const rootValue: ListValue = {
      items: [
        {
          itemId: 'ava',
          values: {
            name: 'Ava',
            addresses: {
              items: [
                {
                  itemId: 'addr-1',
                  values: { street: '1 Oak St', occupants: { items: [{ itemId: 'occ-1', values: { occName: 'Sam' } }] } },
                },
              ],
            },
          },
        },
      ],
    };
    const segments: DrillSegment[] = [
      { fieldAlias: null, itemId: 'ava', label: 'Item 1' },
      { fieldAlias: 'addresses', itemId: 'addr-1', label: 'Item 1' },
      { fieldAlias: 'occupants', itemId: 'occ-1', label: 'Item 1' },
    ];

    // occupants has no labelTemplate of its own, so it falls back to segment.label.
    expect(resolveBreadcrumbLabels(configWithNestedTemplates, rootValue, segments)).toEqual(['Ava', '1 Oak St', 'Item 1']);
  });

  it('falls back to the stored segment label when an item still resolves blank', () => {
    const rootValue: ListValue = { items: [{ itemId: 'ava', values: {} }] };
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Item 1' }];

    expect(resolveBreadcrumbLabels(childrenConfig, rootValue, segments)).toEqual(['Item 1']);
  });

  it('stops (returns fewer labels) if the stack no longer matches the data', () => {
    const rootValue: ListValue = { items: [] };
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'missing', label: 'Ghost' }];

    expect(resolveBreadcrumbLabels(childrenConfig, rootValue, segments)).toEqual([]);
  });
});

describe('setFieldValueAtScope', () => {
  const rootValue: ListValue = {
    items: [
      {
        itemId: 'ava',
        values: {
          name: 'Ava',
          addresses: {
            items: [{ itemId: 'addr-1', values: { street: '1 Oak St', occupants: { items: [] } } }],
          },
        },
      },
    ],
  };

  it('updates a top-level (single-segment) scalar field', () => {
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Ava' }];
    const updated = setFieldValueAtScope(rootValue, segments, 'name', 'Ava Chen');
    expect(updated.items[0].values.name).toBe('Ava Chen');
    // Untouched sibling data survives.
    expect(updated.items[0].values.addresses).toBe(rootValue.items[0].values.addresses);
  });

  it('bubbles a 2nd-level scalar update back through the root', () => {
    const segments: DrillSegment[] = [
      { fieldAlias: null, itemId: 'ava', label: 'Ava' },
      { fieldAlias: 'addresses', itemId: 'addr-1', label: '1 Oak St' },
    ];
    const updated = setFieldValueAtScope(rootValue, segments, 'street', '99 Maple Ave');
    const nested = updated.items[0].values.addresses as ListValue;
    expect(nested.items[0].values.street).toBe('99 Maple Ave');
    // The root item's OWN fields (name) are structurally untouched.
    expect(updated.items[0].values.name).toBe('Ava');
  });

  it('replaces a whole nested ListValue (add/remove/reorder on a nested list bubbles the same way)', () => {
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Ava' }];
    const newAddresses: ListValue = { items: [{ itemId: 'addr-2', values: { street: 'New St' } }] };
    const updated = setFieldValueAtScope(rootValue, segments, 'addresses', newAddresses);
    expect(updated.items[0].values.addresses).toBe(newAddresses);
  });

  it('does not mutate the original value (structural sharing, not in-place edit)', () => {
    const segments: DrillSegment[] = [{ fieldAlias: null, itemId: 'ava', label: 'Ava' }];
    setFieldValueAtScope(rootValue, segments, 'name', 'Someone Else');
    expect(rootValue.items[0].values.name).toBe('Ava');
  });
});
