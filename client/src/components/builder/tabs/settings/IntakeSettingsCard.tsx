
import { ArrowRight, Check, Database, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ApiWorkflow } from "@/lib/vault-api";

interface IntakeSettingsCardProps {
    isIntake: boolean;
    setIsIntake: (value: boolean) => void;
    upstreamWorkflowId: string | null;
    setUpstreamWorkflowId: (value: string | null) => void;
    eligibleUpstream: ApiWorkflow[];
}

export function IntakeSettingsCard({
    isIntake,
    setIsIntake,
    upstreamWorkflowId,
    setUpstreamWorkflowId,
    eligibleUpstream
}: IntakeSettingsCardProps) {
    return (
        <Card className="border-indigo-100 shadow-sm">
            <CardHeader className="bg-indigo-50/30 pb-3">
                <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" />
                    <CardTitle className="text-indigo-900">Intake & Data Reuse</CardTitle>
                </div>
                <CardDescription>
                    Configure how this workflow collects or consumes data from other workflows
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">

                {/* Option A: Is Intake? */}
                <div className="flex items-start justify-between space-x-4">
                    <div className="space-y-1">
                        <Label htmlFor="is-intake" className="text-base font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-500" />
                            Mark as Client Intake Workflow
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Designate this workflow as a primary source of client data. Answers collected here can be reused in downstream workflows.
                        </p>
                    </div>
                    <Switch
                        id="is-intake"
                        checked={isIntake}
                        onCheckedChange={(checked) => {
                            setIsIntake(checked);
                            if (checked) { setUpstreamWorkflowId(null); } // Clear upstream if becoming intake
                        }}
                    />
                </div>

                {isIntake && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-md p-3 text-xs text-indigo-800 flex items-start gap-2">
                        <Check className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                            <strong>Active Intake Source:</strong> Questions in this workflow will export their variables (aliases) to the global client context.
                        </div>
                    </div>
                )}

                <Separator />

                {/* Option B: Consume Intake? */}
                <div className={isIntake ? "opacity-50 pointer-events-none" : ""}>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-base font-medium flex items-center gap-2">
                                <ArrowRight className="w-4 h-4 text-emerald-500" />
                                Link to Upstream Intake
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Connect this workflow to an existing Client Intake workflow to pre-fill answers.
                            </p>
                        </div>

                        <div className="max-w-md">
                            <Select
                                value={upstreamWorkflowId ?? "none"}
                                onValueChange={(val) => setUpstreamWorkflowId(val === "none" ? null : val)}
                                disabled={isIntake}
                            >
                                <SelectTrigger disabled={isIntake} className="bg-background">
                                    <SelectValue placeholder="Select an intake workflow..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {eligibleUpstream.map(w => (
                                        <SelectItem key={w.id} value={w.id}>
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-3 h-3 text-muted-foreground" />
                                                <span>{w.title}</span>
                                                <Badge variant="outline" className="text-[10px] h-4 px-1 ml-2">Intake</Badge>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {upstreamWorkflowId && (
                            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded flex items-center gap-2 mt-2">
                                <Check className="w-3 h-3" />
                                <div className="text-xs">
                                    Linked to <strong>{eligibleUpstream.find(u => u.id === upstreamWorkflowId)?.title}</strong>. variables can be used as default values.
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
