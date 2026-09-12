

import { ExternalSendBlockEditor } from "@/components/blocks/ExternalSendBlockEditor";
import { ListToolsBlockEditor } from "@/components/blocks/ListToolsBlockEditor";
import { QueryBlockEditor } from "@/components/blocks/QueryBlockEditor";
import { ReadTableBlockEditor } from "@/components/blocks/ReadTableBlockEditor";
import { SendDataToTableBlockEditor } from "@/components/blocks/SendDataToTableBlockEditor";
import { ValidateBlockEditor } from "@/components/blocks/ValidateBlockEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Mode } from "@/lib/mode";

import type { ExternalSendBlockConfig, QueryBlockConfig, ReadTableConfig, ValidateConfig, WriteBlockConfig } from "@shared/types/blocks";

import type { BlockFormData } from "../BlockEditorDialog.hooks";

import { blockTypeLabel } from "./blockTypeLabel";

interface RegularBlockFormProps {
    formData: BlockFormData;
    setFormData: (data: BlockFormData) => void;
    mode: Mode;
    workflowId: string;
}

export function RegularBlockForm({ formData, setFormData, mode, workflowId }: RegularBlockFormProps) {

    if (formData.type === 'write' || formData.type === 'send_table') {
        return (
            <SendDataToTableBlockEditor
                workflowId={workflowId}

                config={formData.config as unknown as WriteBlockConfig}
                onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}

                phase={formData.phase}
                onPhaseChange={(p) => setFormData({ ...formData, phase: p })}

                order={Number(formData.order) || 0}
                onOrderChange={(o) => setFormData({ ...formData, order: o })}

                enabled={formData.enabled ?? true}
                onEnabledChange={(e) => setFormData({ ...formData, enabled: e })}
            />
        );
    }


    if (formData.type === 'read_table') {
        return (
            <ReadTableBlockEditor
                workflowId={workflowId}

                config={formData.config as unknown as ReadTableConfig}
                onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}

                phase={formData.phase}
                onPhaseChange={(p) => setFormData({ ...formData, phase: p })}

                order={Number(formData.order) || 0}
                onOrderChange={(o) => setFormData({ ...formData, order: o })}

                enabled={formData.enabled ?? true}
                onEnabledChange={(e) => setFormData({ ...formData, enabled: e })}
            />
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Settings */}
            <div className="space-y-4">
                {/* Hide Block Type for data blocks (write, send_table, read_table, external_send) */}
                {!['write', 'send_table', 'read_table', 'external_send'].includes(formData.type) && (
                    <div className="space-y-3">
                        <Label>Block Type</Label>
                        {/*
                          LIST-B2: read-only, because a block's type is never
                          changeable here. Every one of the dialog's five open
                          sites sets a block before opening it, so the picker
                          that used to sit here was permanently `disabled` — a
                          label wearing a dropdown's clothes, whose options were
                          still filtered by the workflow's mode. Easy mode does
                          not list `list_tools`, so a List Tools block rendered
                          the control blank; `js` and `transform` did the same in
                          both modes. New blocks are created from the page
                          canvas's Add Action menu, which picks the type up front.
                        */}
                        <div
                            data-testid="block-type-value"
                            className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
                        >
                            {blockTypeLabel(formData.type)}
                        </div>
                    </div>
                )}

                {/* Only show execution phase selector for non-data blocks */}
                {!['write', 'send_table', 'read_table', 'external_send'].includes(formData.type) && (
                    <div className="space-y-3">
                        <Label>Execution Phase</Label>
                        <Select value={formData.phase} onValueChange={(v) => setFormData({ ...formData, phase: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="onRunStart">On Run Start</SelectItem>
                                <SelectItem value="onPageEnter">On Page Enter</SelectItem>
                                <SelectItem value="onPageSubmit">On Page Submit</SelectItem>
                                <SelectItem value="onNext">On Next</SelectItem>
                                <SelectItem value="onRunComplete">On Run Complete</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">When should this block run?</p>
                    </div>
                )}

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
            <div className="border-l pl-6">
                <Label className="mb-2 block">Configuration</Label>

                {/* Render specific editors based on type - STRICT ROUTING */}
                {(formData.type === 'write' || formData.type === 'send_table') ? (
                    <SendDataToTableBlockEditor
                        workflowId={workflowId}
                        config={formData.config as unknown as WriteBlockConfig}
                        onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}
                        phase={formData.phase}
                        onPhaseChange={(p) => setFormData({ ...formData, phase: p })}
                        order={Number(formData.order) || 0}
                        onOrderChange={(o) => setFormData({ ...formData, order: o })}
                        enabled={formData.enabled ?? true}
                        onEnabledChange={(e) => setFormData({ ...formData, enabled: e })}
                    />
                ) : formData.type === 'external_send' ? (
                    <ExternalSendBlockEditor
                        workflowId={workflowId}
                        config={formData.config as unknown as ExternalSendBlockConfig}
                        onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}
                        phase={formData.phase}
                        onPhaseChange={(p) => setFormData({ ...formData, phase: p })}
                    />
                ) : formData.type === 'list_tools' ? (
                    <ListToolsBlockEditor workflowId={workflowId} config={formData.config} onChange={(c) => { setFormData({ ...formData, config: c }); }} mode={mode} />
                ) : formData.type === 'query' ? (
                    <QueryBlockEditor workflowId={workflowId} config={formData.config as unknown as QueryBlockConfig} onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }} />
                ) : formData.type === 'validate' ? (
                    <ValidateBlockEditor workflowId={workflowId} config={formData.config as unknown as ValidateConfig} onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }} mode={mode} />
                ) : (
                    <div className="space-y-2">
                        <Textarea
                            value={JSON.stringify(formData.config, null, 2)}
                            onChange={(e) => {
                                try {
                                    setFormData({ ...formData, config: JSON.parse(e.target.value) as Record<string, unknown> });
                                } catch (_error: unknown) {
                                    // Ignore parse errors during typing
                                }
                            }}
                            className="font-mono text-xs h-[300px]"
                            placeholder="{}"
                        />
                        <p className="text-xs text-muted-foreground">JSON Configuration for {formData.type}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
