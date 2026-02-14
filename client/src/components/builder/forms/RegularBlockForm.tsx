/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

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
import { getAvailableBlockTypes, type Mode } from "@/lib/mode";

import type { ExternalSendBlockConfig, QueryBlockConfig, ReadTableConfig, ValidateConfig, WriteBlockConfig } from "@shared/types/blocks";

import type { BlockFormData, UniversalBlock } from "../BlockEditorDialog";

interface RegularBlockFormProps {
    formData: BlockFormData;
    setFormData: (data: BlockFormData) => void;
    mode: Mode;
    block: UniversalBlock | null;
    workflowId: string;
}

// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity
export function RegularBlockForm({ formData, setFormData, mode, block, workflowId }: RegularBlockFormProps) {
    const availableBlockTypes = getAvailableBlockTypes(mode);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (formData.type === 'write' || formData.type === 'send_table') {
        return (
            <SendDataToTableBlockEditor
                workflowId={workflowId}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                config={formData.config as unknown as WriteBlockConfig}
                onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                phase={formData.phase}
                onPhaseChange={(p) => setFormData({ ...formData, phase: p })}
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
                order={Number(formData.order) || 0}
                onOrderChange={(o) => setFormData({ ...formData, order: o })}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                enabled={formData.enabled ?? true}
                onEnabledChange={(e) => setFormData({ ...formData, enabled: e })}
            />
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (formData.type === 'read_table') {
        return (
            <ReadTableBlockEditor
                workflowId={workflowId}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                config={formData.config as unknown as ReadTableConfig}
                onChange={(c) => { setFormData({ ...formData, config: c as unknown as Record<string, unknown> }); }}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                phase={formData.phase}
                onPhaseChange={(p) => setFormData({ ...formData, phase: p })}
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
                order={Number(formData.order) || 0}
                onOrderChange={(o) => setFormData({ ...formData, order: o })}
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                enabled={formData.enabled ?? true}
                onEnabledChange={(e) => setFormData({ ...formData, enabled: e })}
            />
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Settings */}
            <div className="space-y-4">
                {/* Hide Block Type dropdown for data blocks (write, send_table, read_table, external_send) */}
                {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */}
                {!['write', 'send_table', 'read_table', 'external_send'].includes(formData.type) && (
                    <div className="space-y-3">
                        <Label>Block Type</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(v) => {
                                const isRead = v === 'read_table';
                                const isWrite = v === 'write' || v === 'send_table';
                                setFormData({
                                    ...formData,
                                    type: v,
                                    config: {} as Record<string, unknown>,
                                    phase: isRead ? 'onSectionEnter' : isWrite ? 'onSectionSubmit' : 'onRunStart'
                                });
                            }} // Reset config and set default phase on type change
                            disabled={!!block} // If editing, likely shouldn't change type unless we want to allow it (risky for config)
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {/* Show legacy types only if editing a block of that type */}
                                {(formData.type === 'prefill' || block?.type === 'prefill') && <SelectItem value="prefill">Prefill (Deprecated)</SelectItem>}
                                {(formData.type === 'validate' || block?.type === 'validate') && <SelectItem value="validate">Validate (Deprecated)</SelectItem>}
                                {(formData.type === 'branch' || block?.type === 'branch') && <SelectItem value="branch">Branch (Deprecated)</SelectItem>}

                                {/* Supported Types */}
                                {availableBlockTypes.includes('query') && <SelectItem value="query">Read Data (Legacy)</SelectItem>}
                                {availableBlockTypes.includes('list_tools') && <SelectItem value="list_tools">List Tools</SelectItem>}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Only show execution phase selector for non-data blocks */}
                {/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */}
                {!['write', 'send_table', 'read_table', 'external_send'].includes(formData.type) && (
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
