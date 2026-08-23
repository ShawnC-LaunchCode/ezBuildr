/**
 * The map's simulation panel (MAP-8, GH-153 AC3): lets an author enter
 * hypothetical answers for the steps that actually drive routing, and shows
 * the resulting path highlighted on the map (wired by `MapTab`).
 *
 * AC5: `logic_rules` holds 0 rows across 85 production workflows, so most
 * authors opening this panel today will see zero referenced steps. The empty
 * state below says the path is unconditional, deliberately, rather than
 * rendering a blank panel that would read as broken.
 *
 * AC6: a truncated simulation (the walk hit its iteration cap instead of
 * completing — malformed data, see `shared/workflowSimulation.ts`) surfaces
 * as a visible warning here, never swallowed.
 *
 * AC7: every answer field reuses `ConditionValueInput` — the type-aware value
 * editor GH-154 already built for exactly this — via a synthetic
 * `Condition`/`OperatorConfig` pair from `simulationInputs.ts`. This
 * component defines no new type-specific input.
 */
import { AlertTriangle, Route, RotateCcw } from "lucide-react";

import { ConditionValueInput } from "@/components/logic/ConditionValueInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { Condition } from "@shared/types/conditions";

import type { SimulationField } from "./simulationInputs";

interface SimulationPanelProps {
  fields: SimulationField[];
  answers: Record<string, unknown>;
  onAnswerChange: (stepId: string, value: unknown) => void;
  onReset: () => void;
  truncated: boolean;
}

export function SimulationPanel({ fields, answers, onAnswerChange, onReset, truncated }: SimulationPanelProps) {
  const hasAnswers = Object.keys(answers).length > 0;

  return (
    <aside
      aria-label="Simulate a path"
      className="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-[var(--map-page-bg)]"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-[var(--map-page-fg)] opacity-70" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--map-page-fg)]">Simulate a path</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={onReset}
          disabled={!hasAnswers}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset
        </Button>
      </div>

      {truncated && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b px-4 py-2.5 text-xs font-medium text-[var(--map-warning-fg)]"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            This simulation didn&apos;t settle on a route — the workflow&apos;s logic may route in a way that
            never reaches an end. The highlighted path below is incomplete.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {fields.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No condition in this workflow depends on an answer yet, so the path shown on the map is
            unconditional — every respondent follows the same route.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Enter a hypothetical answer to see which route it would produce.
            </p>
            {fields.map((field) => {
              const condition: Condition = {
                type: "condition",
                id: `sim-${field.step.id}`,
                variable: field.step.id,
                operator: field.operatorConfig.value,
                value: answers[field.step.id],
                valueType: "constant",
              };

              return (
                <div
                  key={field.step.id}
                  role="group"
                  aria-label={field.step.title}
                  className="flex flex-col gap-1.5"
                >
                  <Label className="text-xs font-medium text-[var(--map-page-fg)]">
                    {field.step.title}
                    {field.variable.alias && (
                      <span className="ml-1 font-normal text-muted-foreground">({field.variable.alias})</span>
                    )}
                  </Label>
                  <ConditionValueInput
                    condition={condition}
                    operatorConfig={field.operatorConfig}
                    selectedVariable={field.variable}
                    allVariables={[]}
                    onChange={(updates) => onAnswerChange(field.step.id, updates.value)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
