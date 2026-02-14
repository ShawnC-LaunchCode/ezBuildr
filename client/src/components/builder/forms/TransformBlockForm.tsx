
import { JSBlockEditor } from "@/components/blocks/JSBlockEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { BlockFormData } from "../BlockEditorDialog";

interface TransformBlockFormProps {
    formData: BlockFormData;
    setFormData: (data: BlockFormData) => void;
    workflowId: string;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
export function TransformBlockForm({ formData, setFormData, workflowId }: TransformBlockFormProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Settings */}
            <div className="space-y-4">
                <div className="space-y-3">
                    <Label>Language</Label>
                    <Select
                        value={formData.language}
                        onValueChange={(v) => setFormData({ ...formData, language: v })}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="javascript">JavaScript</SelectItem>
                            <SelectItem value="python">Python</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="pt-2">
                        <Label>Block Name</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => { setFormData({ ...formData, name: e.target.value }); }}
                            placeholder="e.g. Calculate Risk Score"
                            className="mt-1"
                        />
                    </div>
                </div>

                <div className="space-y-3">
                    <Label>Execution Phase</Label>
                    <Select value={formData.phase} onValueChange={(v) => setFormData({ ...formData, phase: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="onRunStart">On Run Start</SelectItem>
                            <SelectItem value="onSectionEnter">On Section Enter</SelectItem>
                            <SelectItem value="onSectionSubmit">On Section Submit</SelectItem>
                            <SelectItem value="onNext">On Next</SelectItem>
                            <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">When should this block run?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Order</Label>
                        <Input
                            type="number"
                            value={formData.order}
                            onChange={(e) => { setFormData({ ...formData, order: e.target.value }); }}
                        />
                    </div>
                    <div className="space-y-2 pt-8">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.enabled}
                                onChange={(e) => { setFormData({ ...formData, enabled: e.target.checked }); }}
                                className="rounded border-gray-300"
                            />
                            <span className="text-sm font-medium">Enabled</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Right Column: Editor */}
            <div className="border-l pl-6 h-full">
                <Label className="mb-2 block">Configuration</Label>
                <div className="h-full">
                    <JSBlockEditor
                        workflowId={workflowId}
                        block={{
                            config: {
                                name: formData.name,
                                code: formData.code,
                                inputKeys: formData.inputKeys,
                                outputKey: formData.outputKey,
                                timeoutMs: formData.timeoutMs,
                            }
                        }}
                        onChange={(updated) => {
                            if (updated?.config) {
                                setFormData({
                                    ...formData,
                                    name: updated.config.name ?? formData.name,
                                    code: updated.config.code ?? formData.code,
                                    inputKeys: updated.config.inputKeys ?? formData.inputKeys,
                                    outputKey: updated.config.outputKey ?? formData.outputKey,
                                    timeoutMs: updated.config.timeoutMs ?? formData.timeoutMs
                                });
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
