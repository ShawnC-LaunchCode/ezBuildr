
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';


interface LinkConfig {
    label: string;
    url: string;
}

interface FinalBlockConfig {
    title?: string;
    message?: string; // Markdown supported
    showDocuments?: boolean; // Default true
    redirectUrl?: string; // Optional auto-redirect
    customLinks?: LinkConfig[];
    brandingColor?: string;
}

interface FinalBlockEditorProps {
    config: FinalBlockConfig;
    onUpdate: (updates: Partial<FinalBlockConfig>) => void;
    workflowId: string;
    nodeId: string;
}

export function FinalBlockEditor({
    config,
    onUpdate,
    workflowId,
    nodeId,
}: FinalBlockEditorProps) {
    const customLinks = config.customLinks || [];

    const addLink = () => {
        onUpdate({
            customLinks: [...customLinks, { label: 'Go Back', url: 'https://' }],
        });
    };

    const updateLink = (index: number, updates: Partial<LinkConfig>) => {
        const newLinks = [...customLinks];
        newLinks[index] = { ...newLinks[index], ...updates };
        onUpdate({ customLinks: newLinks });
    };

    const removeLink = (index: number) => {
        const newLinks = customLinks.filter((_, i) => i !== index);
        onUpdate({ customLinks: newLinks });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Completion Screen Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                        id="title"
                        value={config.title || 'All Done!'}
                        onChange={(e) => onUpdate({ title: e.target.value })}
                        placeholder="e.g., Submission Received"
                    />
                </div>

                {/* Message */}
                <div className="space-y-2">
                    <Label htmlFor="message">Message (Markdown supported)</Label>
                    <Textarea
                        id="message"
                        value={config.message || ''}
                        onChange={(e) => onUpdate({ message: e.target.value })}
                        placeholder="Thank you for your submission..."
                        rows={4}
                    />
                </div>

                {/* Options */}
                <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="showDocuments"
                            checked={config.showDocuments !== false} // Default true
                            onCheckedChange={(checked) => onUpdate({ showDocuments: checked === true })}
                        />
                        <Label htmlFor="showDocuments" className="cursor-pointer">
                            Show generated documents for download
                        </Label>
                    </div>
                </div>

                {/* Redirect */}
                <div className="space-y-2">
                    <Label htmlFor="redirectUrl">Auto-Redirect URL (Optional)</Label>
                    <Input
                        id="redirectUrl"
                        value={config.redirectUrl || ''}
                        onChange={(e) => onUpdate({ redirectUrl: e.target.value })}
                        placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">
                        Leave empty to stay on the completion page.
                    </p>
                </div>

                {/* Custom Links */}
                <div className="space-y-2">
                    <Label>Custom Action Buttons</Label>
                    <div className="space-y-2">
                        {customLinks.map((link, index) => (
                            <div key={index} className="flex items-start gap-2 p-2 border rounded-md">
                                <div className="space-y-2 flex-grow">
                                    <Input
                                        value={link.label}
                                        onChange={(e) => updateLink(index, { label: e.target.value })}
                                        placeholder="Button Label"
                                        className="h-8 text-sm"
                                    />
                                    <Input
                                        value={link.url}
                                        onChange={(e) => updateLink(index, { url: e.target.value })}
                                        placeholder="https://..."
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLink(index)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addLink} className="w-full">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Button
                        </Button>
                    </div>
                </div>

                {/* Branding Color */}
                <div className="space-y-2">
                    <Label htmlFor="brandingColor">Accent Color (Hex)</Label>
                    <div className="flex gap-2">
                        <Input
                            id="brandingColor"
                            type="color"
                            value={config.brandingColor || '#000000'}
                            onChange={(e) => onUpdate({ brandingColor: e.target.value })}
                            className="w-12 h-9 p-1"
                        />
                        <Input
                            value={config.brandingColor || ''}
                            onChange={(e) => onUpdate({ brandingColor: e.target.value })}
                            placeholder="#000000"
                            className="flex-grow font-mono"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
