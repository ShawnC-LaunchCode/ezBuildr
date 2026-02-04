
import { Check, Copy, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface PublishingSettingsCardProps {
    isPublic: boolean;
    setIsPublic: (value: boolean) => void;
    requireLogin: boolean;
    setRequireLogin: (value: boolean) => void;
    shareableLink: string;
    linkCopied: boolean;
    onCopyLink: () => void;
}

export function PublishingSettingsCard({
    isPublic,
    setIsPublic,
    requireLogin,
    setRequireLogin,
    shareableLink,
    linkCopied,
    onCopyLink
}: PublishingSettingsCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    <CardTitle>Publishing</CardTitle>
                </div>
                <CardDescription>
                    Control who can access and run this workflow
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="is-public">Public Access</Label>
                        <p className="text-xs text-muted-foreground">
                            Allow anyone with the link to run this workflow
                        </p>
                    </div>
                    <Switch
                        id="is-public"
                        checked={isPublic}
                        onCheckedChange={setIsPublic}
                    />
                </div>

                {isPublic && (
                    <>
                        <Separator />

                        <div className="flex items-center justify-between">
                            <div>
                                <Label htmlFor="require-login">Require Login</Label>
                                <p className="text-xs text-muted-foreground">
                                    Users must sign in to run this workflow
                                </p>
                            </div>
                            <Switch
                                id="require-login"
                                checked={requireLogin}
                                onCheckedChange={setRequireLogin}
                            />
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label>Shareable Link</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={shareableLink}
                                    readOnly
                                    className="flex-1 font-mono text-sm"
                                />
                                <Button variant="outline" onClick={onCopyLink}>
                                    {linkCopied ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Share this link with participants to access the workflow
                            </p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
