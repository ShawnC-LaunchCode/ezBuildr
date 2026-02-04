
import { Settings as SettingsIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface GeneralSettingsCardProps {
    name: string;
    setName: (value: string) => void;
    description: string;
    setDescription: (value: string) => void;
    slug: string;
    setSlug: (value: string) => void;
}

export function GeneralSettingsCard({ name, setName, description, setDescription, slug, setSlug }: GeneralSettingsCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5" />
                    <CardTitle>General</CardTitle>
                </div>
                <CardDescription>
                    Basic workflow information and identification
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Workflow Name</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter workflow name"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe the purpose of this workflow"
                        rows={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                        id="slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="my-workflow"
                    />
                    <p className="text-xs text-muted-foreground">
                        Used in public URLs: /run/{slug}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
