
import { Link as LinkIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface ClientAccessSettingsCardProps {
    allowPortal: boolean;
    setAllowPortal: (value: boolean) => void;
    allowResume: boolean;
    setAllowResume: (value: boolean) => void;
    allowRedownload: boolean;
    setAllowRedownload: (value: boolean) => void;
}

export function ClientAccessSettingsCard({
    allowPortal,
    setAllowPortal,
    allowResume,
    setAllowResume,
    allowRedownload,
    setAllowRedownload
}: ClientAccessSettingsCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    <CardTitle>Client Access & Portal</CardTitle>
                </div>
                <CardDescription>
                    Configure how clients can access their results and history
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="allow-portal">Enable Client Portal Access</Label>
                        <p className="text-xs text-muted-foreground">
                            Allow clients to sign in via email to view past runs and documents
                        </p>
                    </div>
                    <Switch
                        id="allow-portal"
                        checked={allowPortal}
                        onCheckedChange={setAllowPortal}
                    />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="allow-resume">Allow Resuming</Label>
                        <p className="text-xs text-muted-foreground">
                            Allow clients to resume incomplete or outdated workflows from the portal
                        </p>
                    </div>
                    <Switch
                        id="allow-resume"
                        checked={allowResume}
                        onCheckedChange={setAllowResume}
                    />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="allow-redownload">Allow Re-downloading</Label>
                        <p className="text-xs text-muted-foreground">
                            Allow clients to access generated documents after completion
                        </p>
                    </div>
                    <Switch
                        id="allow-redownload"
                        checked={allowRedownload}
                        onCheckedChange={setAllowRedownload}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
