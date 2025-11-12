/**
 * Diff utility for comparing workflow versions
 * Provides machine-readable diffs and human-readable summaries
 */

export interface DiffChange {
  type: 'added' | 'removed' | 'changed';
  path: string;
  oldValue?: any;
  newValue?: any;
}

export interface GraphDiff {
  nodesAdded: Array<{ id: string; type: string }>;
  nodesRemoved: Array<{ id: string; type: string }>;
  nodesChanged: Array<{ id: string; changes: DiffChange[] }>;
  edgesAdded: Array<{ from: string; to: string }>;
  edgesRemoved: Array<{ from: string; to: string }>;
}

export interface VersionDiff {
  graphDiff: GraphDiff;
  bindingsDiff: DiffChange[];
  templatesDiff: DiffChange[];
  checksums: {
    old: string | null;
    new: string | null;
  };
  summary: string[];
}

/**
 * Compare two graphs and return detailed diff
 */
function compareGraphs(oldGraph: any, newGraph: any): GraphDiff {
  const diff: GraphDiff = {
    nodesAdded: [],
    nodesRemoved: [],
    nodesChanged: [],
    edgesAdded: [],
    edgesRemoved: [],
  };

  const oldNodes = new Map((oldGraph?.nodes || []).map((n: any) => [n.id, n]));
  const newNodes = new Map((newGraph?.nodes || []).map((n: any) => [n.id, n]));

  // Find added and changed nodes
  for (const [id, newNode] of newNodes) {
    const oldNode = oldNodes.get(id);
    if (!oldNode) {
      diff.nodesAdded.push({ id, type: newNode.type || 'unknown' });
    } else {
      const changes = compareObjects(oldNode, newNode, `nodes.${id}`);
      if (changes.length > 0) {
        diff.nodesChanged.push({ id, changes });
      }
    }
  }

  // Find removed nodes
  for (const [id, oldNode] of oldNodes) {
    if (!newNodes.has(id)) {
      diff.nodesRemoved.push({ id, type: oldNode.type || 'unknown' });
    }
  }

  // Compare edges
  const oldEdges = new Set((oldGraph?.edges || []).map((e: any) => `${e.source}->${e.target}`));
  const newEdges = new Set((newGraph?.edges || []).map((e: any) => `${e.source}->${e.target}`));

  for (const edge of newEdges) {
    if (!oldEdges.has(edge)) {
      const [from, to] = edge.split('->');
      diff.edgesAdded.push({ from, to });
    }
  }

  for (const edge of oldEdges) {
    if (!newEdges.has(edge)) {
      const [from, to] = edge.split('->');
      diff.edgesRemoved.push({ from, to });
    }
  }

  return diff;
}

/**
 * Compare two objects and return list of changes
 */
function compareObjects(oldObj: any, newObj: any, basePath: string = ''): DiffChange[] {
  const changes: DiffChange[] = [];

  // Get all unique keys
  const allKeys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {}),
  ]);

  for (const key of allKeys) {
    const path = basePath ? `${basePath}.${key}` : key;
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    if (oldVal === undefined && newVal !== undefined) {
      changes.push({ type: 'added', path, newValue: newVal });
    } else if (oldVal !== undefined && newVal === undefined) {
      changes.push({ type: 'removed', path, oldValue: oldVal });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ type: 'changed', path, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

/**
 * Generate human-readable summary from diff
 */
function generateSummary(diff: VersionDiff): string[] {
  const summary: string[] = [];

  // Graph changes
  if (diff.graphDiff.nodesAdded.length > 0) {
    summary.push(`Added ${diff.graphDiff.nodesAdded.length} node(s)`);
  }
  if (diff.graphDiff.nodesRemoved.length > 0) {
    summary.push(`Removed ${diff.graphDiff.nodesRemoved.length} node(s)`);
  }
  if (diff.graphDiff.nodesChanged.length > 0) {
    summary.push(`Modified ${diff.graphDiff.nodesChanged.length} node(s)`);
  }
  if (diff.graphDiff.edgesAdded.length > 0) {
    summary.push(`Added ${diff.graphDiff.edgesAdded.length} connection(s)`);
  }
  if (diff.graphDiff.edgesRemoved.length > 0) {
    summary.push(`Removed ${diff.graphDiff.edgesRemoved.length} connection(s)`);
  }

  // Binding changes
  if (diff.bindingsDiff.length > 0) {
    const added = diff.bindingsDiff.filter(c => c.type === 'added').length;
    const removed = diff.bindingsDiff.filter(c => c.type === 'removed').length;
    const changed = diff.bindingsDiff.filter(c => c.type === 'changed').length;
    if (added > 0) summary.push(`Added ${added} binding(s)`);
    if (removed > 0) summary.push(`Removed ${removed} binding(s)`);
    if (changed > 0) summary.push(`Modified ${changed} binding(s)`);
  }

  // Template changes
  if (diff.templatesDiff.length > 0) {
    const added = diff.templatesDiff.filter(c => c.type === 'added').length;
    const removed = diff.templatesDiff.filter(c => c.type === 'removed').length;
    if (added > 0) summary.push(`Added ${added} template(s)`);
    if (removed > 0) summary.push(`Removed ${removed} template(s)`);
  }

  if (summary.length === 0) {
    summary.push('No changes detected');
  }

  return summary;
}

/**
 * Compute diff between two workflow versions
 */
export function computeVersionDiff(
  oldVersion: {
    graphJson: any;
    bindings?: any;
    templateIds?: string[];
    checksum?: string | null;
  },
  newVersion: {
    graphJson: any;
    bindings?: any;
    templateIds?: string[];
    checksum?: string | null;
  }
): VersionDiff {
  const diff: VersionDiff = {
    graphDiff: compareGraphs(oldVersion.graphJson, newVersion.graphJson),
    bindingsDiff: compareObjects(oldVersion.bindings || {}, newVersion.bindings || {}, 'bindings'),
    templatesDiff: compareObjects(
      { templates: oldVersion.templateIds || [] },
      { templates: newVersion.templateIds || [] },
      'templates'
    ),
    checksums: {
      old: oldVersion.checksum || null,
      new: newVersion.checksum || null,
    },
    summary: [],
  };

  diff.summary = generateSummary(diff);

  return diff;
}
