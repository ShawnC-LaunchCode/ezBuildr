
import { Check, Copy, ExternalLink, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
                                {/* Two icon-only buttons sit side by side here, so both
                                    carry a tooltip — an unlabelled pair is guesswork. */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            onClick={onCopyLink}
                                            disabled={!shareableLink}
                                            aria-label="Copy participant link"
                                        >
                                            {linkCopied ? (
                                                <Check className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {linkCopied ? "Copied" : "Copy link"}
                                    </TooltipContent>
                                </Tooltip>
                                {/* Rendered as a real anchor when there is a link so
                                    middle-click and cmd-click behave normally; the
                                    disabled button is the placeholder before a save
                                    has generated one. */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        {shareableLink ? (
                                            <Button
                                                variant="outline"
                                                asChild
                                                aria-label="Open participant link in a new tab"
                                            >
                                                <a
                                                    href={shareableLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                disabled
                                                aria-label="Open participant link in a new tab"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </TooltipTrigger>
                                    <TooltipContent>Open in new tab</TooltipContent>
                                </Tooltip>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {shareableLink
                                    ? "Share this link with participants, or open it to fill the workflow out yourself"
                                    : "Save settings to generate the participant link"}
                            </p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
