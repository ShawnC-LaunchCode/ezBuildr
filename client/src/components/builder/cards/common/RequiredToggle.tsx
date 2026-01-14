/**
 * Required Toggle Component
 * Toggle for marking a field as required
 */

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface RequiredToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function RequiredToggle({ checked, onChange }: RequiredToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">Required</Label>
        <p className="text-xs text-muted-foreground">
          User must answer this question to continue
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
