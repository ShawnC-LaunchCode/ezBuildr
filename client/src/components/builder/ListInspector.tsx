/**
 * List Inspector Panel
 * Shows metadata and preview for list variables in Advanced Mode
 */

import { Database, Layers, Filter, ArrowUpDown, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface ListVariable {
  metadata: {
    source: 'read_table' | 'query' | 'list_tools';
    sourceId?: string;
    tableName?: string;
    queryName?: string;
    filteredBy?: string[];
    sortedBy?: { columnId: string; direction: 'asc' | 'desc' };
  };
  rows: Array<{
    id: string;
    [key: string]: any;
  }>;
  count: number;
  columns: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

interface ListInspectorProps {
  list: ListVariable;
  variableName: string;
}

export function ListInspector({ list, variableName }: ListInspectorProps) {
  const { toast } = useToast();

  const handleCopyReference = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast({
      title: "Copied",
      description: `Reference copied: ${ref}`,
    });
  };

  const getSourceIcon = () => {
    switch (list.metadata.source) {
      case 'read_table': return <Database className="w-4 h-4" />;
      case 'query': return <Database className="w-4 h-4" />;
      case 'list_tools': return <Layers className="w-4 h-4" />;
      default: return <Layers className="w-4 h-4" />;
    }
  };

  const getSourceLabel = () => {
    switch (list.metadata.source) {
      case 'read_table': return 'Read Table';
      case 'query': return 'Query';
      case 'list_tools': return 'List Tools';
      default: return 'Unknown';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {getSourceIcon()}
            List Inspector: {variableName}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {getSourceLabel()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metadata */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="text-muted-foreground">Row Count</div>
            <div className="font-mono font-semibold">{list.count}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Columns</div>
            <div className="font-mono font-semibold">{list.columns.length}</div>
          </div>
        </div>

        {/* Source Info */}
        {list.metadata.tableName && (
          <div className="space-y-1 text-xs">
            <div className="text-muted-foreground">Source Table</div>
            <div className="font-mono text-sm">{list.metadata.tableName}</div>
          </div>
        )}

        {list.metadata.queryName && (
          <div className="space-y-1 text-xs">
            <div className="text-muted-foreground">Query Name</div>
            <div className="font-mono text-sm">{list.metadata.queryName}</div>
          </div>
        )}

        {/* Filter/Sort Info */}
        {list.metadata.filteredBy && list.metadata.filteredBy.length > 0 && (
          <div className="flex items-center gap-2 text-xs p-2 bg-blue-50 rounded-md">
            <Filter className="w-3 h-3 text-blue-600" />
            <span className="text-blue-900">
              Filtered by {list.metadata.filteredBy.length} column{list.metadata.filteredBy.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {list.metadata.sortedBy && (
          <div className="flex items-center gap-2 text-xs p-2 bg-purple-50 rounded-md">
            <ArrowUpDown className="w-3 h-3 text-purple-600" />
            <span className="text-purple-900">
              Sorted by: {list.columns.find(c => c.id === list.metadata.sortedBy?.columnId)?.name || 'Unknown'} ({list.metadata.sortedBy.direction})
            </span>
          </div>
        )}

        {/* Columns */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium">Columns</div>
          <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
            {list.columns.map((col) => (
              <div
                key={col.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs hover:bg-muted group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{col.name}</div>
                  <div className="text-muted-foreground text-[10px]">{col.type}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => handleCopyReference(`${variableName}.rows[i].${col.id}`)}
                  title="Copy reference"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick References */}
        <div className="space-y-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground font-medium">Quick References</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs font-mono group hover:bg-muted/50">
              <span>{variableName}.count</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={() => handleCopyReference(`${variableName}.count`)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs font-mono group hover:bg-muted/50">
              <span>{variableName}.rows[0]</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={() => handleCopyReference(`${variableName}.rows[0]`)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Row Preview */}
        {list.count > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium">
              Preview Rows ({Math.min(3, list.count)} of {list.count})
            </div>
            <div className="space-y-1 max-h-48 overflow-auto">
              {list.rows.slice(0, 3).map((row, idx) => (
                <div key={idx} className="p-2 bg-muted/30 rounded text-[10px] border border-border">
                  <div className="font-semibold text-muted-foreground mb-1">Row {idx}</div>
                  <div className="space-y-0.5">
                    {list.columns.slice(0, 5).map((col) => (
                      <div key={col.id} className="flex items-start gap-2">
                        <span className="text-muted-foreground min-w-[80px] truncate">{col.name}:</span>
                        <span className="font-mono flex-1 truncate">{String(row[col.id] ?? 'null')}</span>
                      </div>
                    ))}
                    {list.columns.length > 5 && (
                      <div className="text-muted-foreground italic">
                        + {list.columns.length - 5} more columns
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variable Reference Info */}
        <div className="space-y-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground font-medium">Variable Reference</div>
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 rounded text-[10px] font-mono border border-indigo-200 dark:border-indigo-800">
            <code className="text-indigo-700 dark:text-indigo-300">{variableName}</code>
          </div>
          <p className="text-[10px] text-muted-foreground pl-1">
            Use this alias in JS blocks, logic, and templates. Internal IDs are hidden.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
