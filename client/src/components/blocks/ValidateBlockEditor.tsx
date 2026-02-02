
import type { ValidateConfig, ValidateRule } from "@shared/types/blocks";

import { ValidationRulesEditor } from "../builder/ValidationRulesEditor";

interface ValidateBlockEditorProps {
    workflowId: string;
    config: ValidateConfig;
    onChange: (config: ValidateConfig) => void;
    mode?: "easy" | "advanced";
}

export function ValidateBlockEditor({ workflowId, config, onChange, mode = "easy" }: ValidateBlockEditorProps) {
    return (
        <div className="space-y-4">
            <ValidationRulesEditor
                rules={config.rules ?? []}
                onChange={(newRules: ValidateRule[]) => onChange({ ...config, rules: newRules })}
                workflowId={workflowId}
                mode={mode}
            />
        </div>
    );
}