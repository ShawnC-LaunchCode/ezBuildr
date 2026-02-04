
import { Settings as SettingsIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface BehaviorSettingsCardProps {
    completionMessage: string;
    setCompletionMessage: (value: string) => void;
    redirectUrl: string;
    setRedirectUrl: (value: string) => void;
    allowSaveAndResume: boolean;
    setAllowSaveAndResume: (value: boolean) => void;
}

export function BehaviorSettingsCard({
    completionMessage,
    setCompletionMessage,
    redirectUrl,
    setRedirectUrl,
    allowSaveAndResume,
    setAllowSaveAndResume
}: BehaviorSettingsCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5" />
                    <CardTitle>Behavior</CardTitle>
                </div>
                <CardDescription>
                    Configure workflow completion and user experience
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="completion-message">Completion Message</Label>
                    <Textarea
                        id="completion-message"
                        value={completionMessage}
                        onChange={(e) => setCompletionMessage(e.target.value)}
                        placeholder="Thank you message shown after completion"
                        rows={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="redirect-url">Redirect URL (Optional)</Label>
                    <Input
                        id="redirect-url"
                        value={redirectUrl}
                        onChange={(e) => setRedirectUrl(e.target.value)}
                        placeholder="https://example.com/thank-you"
                    />
                    <p className="text-xs text-muted-foreground">
                        Redirect users to this URL after completion instead of showing completion message
                    </p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="save-resume">Allow Save & Resume</Label>
                        <p className="text-xs text-muted-foreground">
                            Let users save progress and return later
                        </p>
                    </div>
                    <Switch
                        id="save-resume"
                        checked={allowSaveAndResume}
                        onCheckedChange={setAllowSaveAndResume}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
