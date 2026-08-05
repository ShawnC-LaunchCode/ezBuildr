
import { Palette } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

interface BrandingSettingsCardProps {
    brandingEnabled: boolean;
    setBrandingEnabled: (value: boolean) => void;
    logoUrl: string;
    setLogoUrl: (value: string) => void;
    primaryColor: string;
    setPrimaryColor: (value: string) => void;
    secondaryColor: string;
    setSecondaryColor: (value: string) => void;
    organizationName: string;
    setOrganizationName: (value: string) => void;
    faviconUrl: string;
    setFaviconUrl: (value: string) => void;
    whiteLabel: boolean;
    setWhiteLabel: (value: boolean) => void;
}

export function BrandingSettingsCard({
    brandingEnabled,
    setBrandingEnabled,
    logoUrl,
    setLogoUrl,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor,
    organizationName,
    setOrganizationName,
    faviconUrl,
    setFaviconUrl,
    whiteLabel,
    setWhiteLabel
}: BrandingSettingsCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    <CardTitle>Branding</CardTitle>
                </div>
                <CardDescription>
                    Customize the appearance of your workflow
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label htmlFor="branding-enabled">Enable Custom Branding</Label>
                        <p className="text-xs text-muted-foreground">
                            Apply custom colors and logo to this workflow
                        </p>
                    </div>
                    <Switch
                        id="branding-enabled"
                        checked={brandingEnabled}
                        onCheckedChange={setBrandingEnabled}
                    />
                </div>

                {brandingEnabled && (
                    <>
                        <Separator />

                        <div className="space-y-2">
                            <Label htmlFor="organization-name">Organization Name</Label>
                            <Input
                                id="organization-name"
                                value={organizationName}
                                onChange={(e) => setOrganizationName(e.target.value)}
                                placeholder="Acme Legal"
                            />
                            <p className="text-xs text-muted-foreground">
                                Shown to participants in place of the ezBuildr name, and used as the
                                logo&apos;s alt text.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="logo">Logo URL</Label>
                            <Input
                                id="logo"
                                value={logoUrl}
                                onChange={(e) => setLogoUrl(e.target.value)}
                                placeholder="https://example.com/logo.png"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="favicon">Favicon URL</Label>
                            <Input
                                id="favicon"
                                value={faviconUrl}
                                onChange={(e) => setFaviconUrl(e.target.value)}
                                placeholder="https://example.com/favicon.ico"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="primary-color">Primary Color</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="primary-color"
                                        type="color"
                                        value={primaryColor}
                                        onChange={(e) => setPrimaryColor(e.target.value)}
                                        className="w-16 h-10 p-1"
                                    />
                                    <Input
                                        value={primaryColor}
                                        onChange={(e) => setPrimaryColor(e.target.value)}
                                        placeholder="#3b82f6"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="secondary-color">Secondary Color</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="secondary-color"
                                        type="color"
                                        value={secondaryColor}
                                        onChange={(e) => setSecondaryColor(e.target.value)}
                                        className="w-16 h-10 p-1"
                                    />
                                    <Input
                                        value={secondaryColor}
                                        onChange={(e) => setSecondaryColor(e.target.value)}
                                        placeholder="#8b5cf6"
                                    />
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div>
                                <Label htmlFor="white-label">White Label</Label>
                                <p className="text-xs text-muted-foreground">
                                    Remove &ldquo;powered by ezBuildr&rdquo; from every screen your
                                    participants see.
                                </p>
                            </div>
                            <Switch
                                id="white-label"
                                checked={whiteLabel}
                                onCheckedChange={setWhiteLabel}
                            />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
