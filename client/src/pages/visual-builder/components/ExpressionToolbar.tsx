/**
 * ExpressionToolbar - Quick-insert toolbar for variables, helpers, and snippets
 */

import { Variable, FunctionSquare, FileText } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useAvailableVars } from '../hooks/useAvailableVars';
import { useHelpers } from '../hooks/useHelpers';

export interface ExpressionToolbarProps {
  workflowId: string;
  nodeId: string;
  onInsert: (text: string) => void;
}

const SNIPPETS = [
  {
    label: 'If/Else',
    template: '(${1:condition}) ? ${2:trueValue} : ${3:falseValue}',
    preview: '(condition) ? trueValue : falseValue',
  },
  {
    label: 'Coalesce',
    template: 'coalesce(${1:a}, ${2:b})',
    preview: 'coalesce(a, b)',
  },
  {
    label: 'Round',
    template: 'round(${1:number}, ${2:2})',
    preview: 'round(number, 2)',
  },
  {
    label: 'Equal',
    template: '${1:var} == ${2:value}',
    preview: 'var == value',
  },
  {
    label: 'Greater Than',
    template: '${1:var} > ${2:value}',
    preview: 'var > value',
  },
  {
    label: 'Less Than',
    template: '${1:var} < ${2:value}',
    preview: 'var < value',
  },
  {
    label: 'And',
    template: '${1:condition1} && ${2:condition2}',
    preview: 'condition1 && condition2',
  },
  {
    label: 'Or',
    template: '${1:condition1} || ${2:condition2}',
    preview: 'condition1 || condition2',
  },
  {
    label: 'Not Empty',
    template: '!isEmpty(${1:var})',
    preview: '!isEmpty(var)',
  },
];

export function ExpressionToolbar({ workflowId, nodeId, onInsert }: ExpressionToolbarProps) {
  const { data: availableVarsData } = useAvailableVars(workflowId, nodeId);
  const { data: helpersData } = useHelpers();

  const handleInsertVariable = (varName: string) => {
    onInsert(varName);
  };

  const handleInsertHelper = (helperName: string, signature: string) => {
    // Create simple insert text (without snippet placeholders for simple click-insert)
    const insertText = `${helperName}()`;
    onInsert(insertText);
  };

  const handleInsertSnippet = (template: string) => {
    // Convert snippet template to simple text (remove placeholders)
    const simpleText = template.replace(/\$\{\d+:([^}]+)\}/g, '$1');
    onInsert(simpleText);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap p-2 bg-muted/30 border rounded-md">
      {/* Variables Section */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Variable className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Available variables at this node</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {availableVarsData?.vars && availableVarsData.vars.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {availableVarsData.vars.slice(0, 5).map((varName) => (
              <Badge
                key={varName}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80 text-xs"
                onClick={() => handleInsertVariable(varName)}
              >
                {varName}
              </Badge>
            ))}
            {availableVarsData.vars.length > 5 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge variant="outline" className="cursor-pointer text-xs">
                    +{availableVarsData.vars.length - 5} more
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                  {availableVarsData.vars.slice(5).map((varName) => (
                    <DropdownMenuItem
                      key={varName}
                      onClick={() => handleInsertVariable(varName)}
                      className="font-mono text-sm"
                    >
                      {varName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No variables available</span>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Helpers Section */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <FunctionSquare className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Helper functions</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs">
              Insert Helper
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
            {helpersData?.helpers ? (
              <>
                {/* Group by category */}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Math</div>
                {helpersData.helpers
                  .filter((h) => ['round', 'ceil', 'floor', 'abs', 'min', 'max'].includes(h.name))
                  .map((helper) => (
                    <DropdownMenuItem
                      key={helper.name}
                      onClick={() => handleInsertHelper(helper.name, helper.signature)}
                      className="flex flex-col items-start"
                    >
                      <div className="font-mono text-sm font-medium">{helper.signature}</div>
                      {helper.doc && (
                        <div className="text-xs text-muted-foreground">{helper.doc}</div>
                      )}
                    </DropdownMenuItem>
                  ))}

                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">String</div>
                {helpersData.helpers
                  .filter((h) => ['len', 'upper', 'lower', 'contains', 'trim', 'concat'].includes(h.name))
                  .map((helper) => (
                    <DropdownMenuItem
                      key={helper.name}
                      onClick={() => handleInsertHelper(helper.name, helper.signature)}
                      className="flex flex-col items-start"
                    >
                      <div className="font-mono text-sm font-medium">{helper.signature}</div>
                      {helper.doc && (
                        <div className="text-xs text-muted-foreground">{helper.doc}</div>
                      )}
                    </DropdownMenuItem>
                  ))}

                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Array</div>
                {helpersData.helpers
                  .filter((h) => ['includes', 'count'].includes(h.name))
                  .map((helper) => (
                    <DropdownMenuItem
                      key={helper.name}
                      onClick={() => handleInsertHelper(helper.name, helper.signature)}
                      className="flex flex-col items-start"
                    >
                      <div className="font-mono text-sm font-medium">{helper.signature}</div>
                      {helper.doc && (
                        <div className="text-xs text-muted-foreground">{helper.doc}</div>
                      )}
                    </DropdownMenuItem>
                  ))}

                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Date & Logic</div>
                {helpersData.helpers
                  .filter((h) => ['dateDiff', 'coalesce', 'isEmpty', 'not'].includes(h.name))
                  .map((helper) => (
                    <DropdownMenuItem
                      key={helper.name}
                      onClick={() => handleInsertHelper(helper.name, helper.signature)}
                      className="flex flex-col items-start"
                    >
                      <div className="font-mono text-sm font-medium">{helper.signature}</div>
                      {helper.doc && (
                        <div className="text-xs text-muted-foreground">{helper.doc}</div>
                      )}
                    </DropdownMenuItem>
                  ))}
              </>
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading helpers...</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Snippets Section */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Common patterns</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-xs">
              Snippets
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {SNIPPETS.map((snippet) => (
              <DropdownMenuItem
                key={snippet.label}
                onClick={() => handleInsertSnippet(snippet.template)}
                className="flex flex-col items-start"
              >
                <div className="text-sm font-medium">{snippet.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{snippet.preview}</div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
