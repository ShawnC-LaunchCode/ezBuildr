
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { TransformBlockLanguage, ApiTransformBlock } from "@/lib/vault-api";

interface TransformBlockFormData {
    name: string;
    language: TransformBlockLanguage;
    phase: ApiTransformBlock["phase"];
    code: string;
    inputKeys: string[];
    outputKey: string;
    timeoutMs: number;
    enabled: boolean;
    order: number;
}

interface TransformBlockFormProps {
    formData: TransformBlockFormData;
    onChange: (data: TransformBlockFormData) => void;
    inputKeysText: string;
    onInputKeysChange: (text: string) => void;
}

export function TransformBlockForm({
    formData,
    onChange,
    inputKeysText,
    onInputKeysChange
}: TransformBlockFormProps): JSX.Element {
    return (
        <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                        value={formData.name}
                        onChange={(e) => { onChange({ ...formData, name: e.target.value }); }}
                        placeholder="e.g., Calculate Total"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Language</Label>
                    <Select
                        value={formData.language}
                        onValueChange={(v: TransformBlockLanguage) => onChange({ ...formData, language: v })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="javascript">JavaScript</SelectItem>
                            <SelectItem value="python">Python</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Execution Phase</Label>
                <Select
                    value={formData.phase}
                    onValueChange={(v) => onChange({ ...formData, phase: v as ApiTransformBlock["phase"] })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="onRunStart">On Run Start</SelectItem>
                        <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                        <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                        <SelectItem value="onNext">On Next</SelectItem>
                        <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">When this block should execute</p>
            </div>

            <div className="space-y-2">
                <Label>Code</Label>
                <Textarea
                    value={formData.code}
                    onChange={(e) => { onChange({ ...formData, code: e.target.value }); }}
                    rows={12}
                    className="font-mono text-xs"
                    placeholder={
                        formData.language === "javascript"
                            ? "// Input values available as variables\n// Return the output value\nreturn inputValue1 + inputValue2;"
                            : "# Input values available as variables\n# Return the output value\nreturn input_value1 + input_value2"
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Input Keys (comma-separated)</Label>
                    <Input
                        value={inputKeysText}
                        onChange={(e) => { onInputKeysChange(e.target.value); }}
                        placeholder="e.g., firstName, lastName"
                    />
                    <p className="text-xs text-muted-foreground">Variables available in your code</p>
                </div>

                <div className="space-y-2">
                    <Label>Output Key</Label>
                    <Input
                        value={formData.outputKey}
                        onChange={(e) => { onChange({ ...formData, outputKey: e.target.value }); }}
                        placeholder="e.g., fullName"
                    />
                    <p className="text-xs text-muted-foreground">Where the result will be stored</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label>Timeout (ms)</Label>
                    <Input
                        type="number"
                        value={formData.timeoutMs}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            onChange({ ...formData, timeoutMs: isNaN(val) ? 1000 : val });
                        }}
                        min={100}
                        max={3000}
                    />
                    <p className="text-xs text-muted-foreground">100-3000ms</p>
                </div>

                <div className="space-y-2">
                    <Label>Order</Label>
                    <Input
                        type="number"
                        value={formData.order}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            onChange({ ...formData, order: isNaN(val) ? 0 : val });
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Enabled</Label>
                    <div className="flex items-center space-x-2 pt-2">
                        <Switch
                            checked={formData.enabled}
                            onCheckedChange={(checked) => onChange({ ...formData, enabled: checked })}
                        />
                        <span className="text-sm text-muted-foreground">
                            {formData.enabled ? "Enabled" : "Disabled"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
