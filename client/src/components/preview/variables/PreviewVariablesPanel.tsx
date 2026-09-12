import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useFilteredVariables } from '@/components/builder/variables/useFilteredVariables';
import { getVariableIcon } from '@/components/builder/variables/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCodeBlockRuns, type PreviewVariable } from '@/hooks/api/useCodeBlockRuns';
import type { ApiAdvanceBlockState, ApiAdvanceResult } from '@/lib/vault-api';

interface PreviewVariablesPanelProps {
  runId: string;
  values: Record<string, unknown>;
  result?: ApiAdvanceResult;
  onClose: () => void;
}

function stateText(state: ApiAdvanceBlockState | undefined): string {
  if (!state) { return 'Not evaluated — no recorded state'; }
  switch (state.status) {
    case 'fired': return 'Fired';
    case 'skipped_unready': return state.pendingInputs.length > 0
      ? `Waiting on ${state.pendingInputs.join(', ')}` : 'Waiting — no pending inputs recorded';
    case 'skipped_unchanged': return 'Skipped, unchanged';
    case 'error': return `Errored: ${state.errorMessage ?? 'No message recorded'}`;
    default: return `Recorded state: ${state.status}`;
  }
}

function displayValue(value: unknown): string {
  if (value === undefined) { return 'Not set'; }
  return JSON.stringify(value, null, 2);
}

export function PreviewVariablesPanel({ runId, values, result, onClose }: PreviewVariablesPanelProps) {
  const inspector = useCodeBlockRuns(runId, true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  // A late bootstrap response must never replace a submission's states, even
  // when that submission intentionally returns an empty set.
  const states = result?.blockStates ?? inspector.data?.blockStates ?? [];
  const committedValues = result?.values ?? values;
  const variables = useMemo(() => inspector.data?.variables ?? [], [inspector.data]);
  const { groupedVariables, counts } = useFilteredVariables(variables, searchQuery, activeTab);
  const metadata = new Map(variables.map(variable => [variable.key, variable]));
  const byBlock = new Map(states.map(state => [state.stepId, state]));

  return <aside aria-label="Preview variables" className="absolute right-0 inset-y-0 z-20 sm:static h-full w-full sm:w-[26rem] sm:shrink-0 border-l bg-background flex flex-col min-h-0 shadow-lg">
    <div className="p-3 border-b flex items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold">Variables</h2>
        <p className="text-xs text-muted-foreground mt-1">Committed values · updates after each submit</p></div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Close variables" onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
    <div className="p-3 space-y-2 border-b bg-muted/20">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="questions" className="text-xs">Questions</TabsTrigger>
          <TabsTrigger value="lists" className="text-xs">Lists</TabsTrigger>
          <TabsTrigger value="computed" className="text-xs">Computed</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Search variables" placeholder="Search aliases or labels…" className="pl-8 h-8 text-xs" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></div>
    </div>
    <div className="flex-1 overflow-auto min-h-0 p-3 space-y-4">
      {inspector.isPending && <p role="status" className="text-sm text-muted-foreground">Loading variables…</p>}
      {inspector.error && <div role="alert" className="text-sm space-y-2"><p>Unable to load variables: {inspector.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => { void inspector.refetch(); }}>Retry variables</Button></div>}
      {inspector.data && counts.total === 0 && <p className="text-sm text-muted-foreground py-4">
        {variables.length === 0 ? 'No variables in this preview.' : 'No matching variables. Try another search or filter.'}</p>}
      {Object.entries(groupedVariables).map(([page, entries]) => <section key={page} aria-label={page}>
        <h3 className="text-xs font-medium text-muted-foreground mb-2">{page}</h3>
        <div className="divide-y border rounded-md">{entries.map(entry => {
          const variable = metadata.get(entry.key) as PreviewVariable;
          return <article key={entry.key} aria-label={`Variable ${variable.alias ?? variable.key}`} className="p-3 space-y-2 min-w-0">
            <div className="flex items-start gap-2">
              <span className="mt-0.5" aria-hidden="true">{getVariableIcon(variable.type)}</span>
              <code className="text-xs font-semibold break-all flex-1">{variable.alias ?? variable.key}</code>
              {variable.isVirtual && <Badge variant="secondary" className="text-xs shrink-0">Computed</Badge>}
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex gap-1"><dt>Type:</dt><dd>{variable.declaredType}</dd></div>
              <div className="flex gap-1"><dt>Source:</dt><dd>{variable.source}</dd></div>
            </dl>
            <pre aria-label="Current value" className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded p-2 max-h-48 overflow-auto">{displayValue(committedValues[variable.stepId])}</pre>
            {variable.blockStepId && <p className="text-xs leading-relaxed break-words" role="status">{stateText(byBlock.get(variable.blockStepId))}</p>}
          </article>;
        })}</div>
      </section>)}
    </div>
    <div className="border-t p-3 text-xs text-muted-foreground">{counts.total} variable{counts.total === 1 ? '' : 's'}</div>
  </aside>;
}
