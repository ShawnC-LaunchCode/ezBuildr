/**
 * NodeCard - Visual representation of workflow nodes in React Flow
 */

import { MessageSquare, Calculator, GitBranch, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import type { BuilderNode } from '../store/useBuilderStore';

// Node type colors
const NODE_COLORS = {
  question: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-500',
  },
  compute: {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500',
  },
  branch: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-500',
  },
  template: {
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-700 dark:text-green-300',
    badge: 'bg-green-500',
  },
  final: {
    bg: 'bg-slate-50 dark:bg-slate-950',
    border: 'border-slate-300 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-slate-500',
  },
};

// Node type icons
const NODE_ICONS = {
  question: MessageSquare,
  compute: Calculator,
  branch: GitBranch,
  template: FileText,
  final: CheckCircle2,
};

export const NodeCard = memo(({ data, selected }: NodeProps<BuilderNode['data']>) => {
  const nodeType = (data as any).nodeType || 'question';
  const colors = NODE_COLORS[nodeType as keyof typeof NODE_COLORS] || NODE_COLORS.question;
  const Icon = NODE_ICONS[nodeType as keyof typeof NODE_ICONS] || MessageSquare;

  const config = data.config || {};
  const hasCondition = config.condition && config.condition.trim() !== '';

  // Get variable name based on node type
  const getVariableName = () => {
    switch (nodeType) {
      case 'question':
        return config.key;
      case 'compute':
        return config.outputKey;
      default:
        return null;
    }
  };

  const variableName = getVariableName();

  return (
    <div className="relative">
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white"
      />

      <Card
        className={`
          min-w-[200px] max-w-[300px] transition-all
          ${colors.bg} ${colors.border} border-2
          ${selected ? 'ring-2 ring-offset-2 ring-blue-500 shadow-lg' : 'shadow-sm'}
          hover:shadow-md
        `}
      >
        <CardHeader className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${colors.text}`} />
              <Badge className={`${colors.badge} text-white text-xs`}>
                {nodeType}
              </Badge>
            </div>
            {hasCondition && (
              <div title="Has condition">
                <AlertCircle className="w-4 h-4 text-orange-500" />
              </div>
            )}
          </div>

          <CardTitle className="text-sm font-medium leading-tight">
            {data.label || 'Untitled Node'}
          </CardTitle>

          {variableName && (
            <CardDescription className="text-xs font-mono">
              ${variableName}
            </CardDescription>
          )}

          {/* Node-specific preview */}
          <div className="text-xs text-muted-foreground">
            {nodeType === 'question' && config.inputType && (
              <span className="italic">{config.inputType}</span>
            )}
            {nodeType === 'compute' && config.expression && (
              <span className="italic truncate block">{config.expression}</span>
            )}
            {nodeType === 'branch' && config.branches && (
              <span className="italic">{config.branches.length} branches</span>
            )}
            {nodeType === 'template' && config.templateId && (
              <span className="italic truncate block">Template: {config.templateId}</span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
});

NodeCard.displayName = 'NodeCard';

// Custom node types for React Flow
export const nodeTypes = {
  question: NodeCard,
  compute: NodeCard,
  branch: NodeCard,
  template: NodeCard,
};
