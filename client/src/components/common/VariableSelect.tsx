/**
 * VariableSelect - Dropdown selector for workflow variables (steps with aliases)
 *
 * This component displays all steps in a workflow, showing their alias (if available)
 * or key, allowing users to select variables for use in logic rules and blocks.
 */

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ApiWorkflowVariable } from "@/lib/vault-api";
import { useWorkflowVariables } from "@/lib/vault-hooks";

interface VariableSelectProps {
  workflowId: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function VariableSelect({ workflowId, value, onChange, placeholder, disabled }: VariableSelectProps) {
  const { data: variables, isLoading } = useWorkflowVariables(workflowId);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading variables..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (!variables || variables.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="No variables available" />
        </SelectTrigger>
      </Select>
    );
  }

  // Group variables by page
  const variablesByPage = variables.reduce((acc, variable) => {
    const pageId = variable.pageId;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!acc[pageId]) {
      acc[pageId] = {
        title: variable.pageTitle,
        variables: [],
      };
    }
    acc[pageId].variables.push(variable);
    return acc;
  }, {} as Record<string, { title: string; variables: ApiWorkflowVariable[] }>);

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="font-mono text-sm">
        <SelectValue placeholder={placeholder ?? "Select a variable..."}>
          {value && (() => {
            const selectedVar = variables.find(v => v.key === value);
            return selectedVar ? (
              <span>
                {selectedVar.alias ? (
                  <span className="font-mono">
                    <span className="font-semibold text-primary">{selectedVar.alias}</span>
                    <span className="text-muted-foreground text-xs ml-2">({selectedVar.label})</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {selectedVar.label}
                  </span>
                )}
              </span>
            ) : value;
          })()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(variablesByPage).map(([pageId, { title, variables: pageVars }]) => (
          <SelectGroup key={pageId}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">
              {title}
            </SelectLabel>
            {pageVars.map((variable) => (
              <SelectItem
                key={variable.key}
                value={variable.key}
                className="font-mono text-sm"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    {variable.alias ? (
                      <>
                        <span className="font-semibold text-primary">{variable.alias}</span>
                        <span className="text-xs text-muted-foreground">→ {variable.label}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{variable.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {variable.type}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
