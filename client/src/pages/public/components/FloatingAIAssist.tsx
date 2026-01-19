import { Sparkles, X, MessageSquare, HelpCircle, Settings } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePersonalizationStore } from '../../../lib/stores/personalizationStore';
interface FloatingAIAssistProps {
    currentBlockText?: string;
    onRewrite?: (text: string) => void;
    onHelp?: (text: string) => void;
}
export const FloatingAIAssist: React.FC<FloatingAIAssistProps> = ({ currentBlockText, onRewrite, onHelp }) => {
    const { isOpen, togglePanel, settings, setSettings } = usePersonalizationStore();
    const [loading, setLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState<string | null>(null);
    if (!settings) {return null;} // Wait for settings to load
    const handleRewrite = async () => {
        if (!currentBlockText) {return;}
        setLoading(true);
        try {
            // Trigger rewrite via API
            const res = await fetch('/api/ai/personalize/block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ block: { text: currentBlockText }, userAnswers: {} }) // TODO: pass actual answers if needed
            });
            const data = await res.json();
            if (data.text && onRewrite) {
                onRewrite(data.text);
                setAiResponse("I've rewritten the question for you.");
            }
        } catch (e) {
            console.error(e);
            setAiResponse("Sorry, I couldn't rewrite that.");
        } finally {
            setLoading(false);
        }
    };
    const handleExplain = async () => {
        if (!currentBlockText) {return;}
        setLoading(true);
        try {
            const res = await fetch('/api/ai/personalize/help', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentBlockText })
            });
            const data = await res.json();
            if (data.text) {
                setAiResponse(data.text);
                if (onHelp) {onHelp(data.text);}
            }
        } catch (e) {
            setAiResponse("Sorry, I couldn't explain that.");
        } finally {
            setLoading(false);
        }
    };
    if (!isOpen) {
        return (
            <Button
                className="fixed bottom-4 right-4 rounded-full w-12 h-12 shadow-lg z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                onClick={togglePanel}
            >
                <Sparkles className="w-6 h-6 text-white" />
            </Button>
        );
    }
    return (
        <div className="fixed bottom-4 right-4 w-96 bg-background border rounded-xl shadow-2xl z-50 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b flex justify-between items-center bg-muted/40 rounded-t-xl">
                <h3 className="font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    AI Assistant
                </h3>
                <Button variant="ghost" size="icon" onClick={togglePanel} className="h-8 w-8">
                    <X className="w-4 h-4" />
                </Button>
            </div>
            <ScrollArea className="flex-1 p-4 space-y-6">
                {/* Actions */}
                <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Capabilities</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => { void handleRewrite(); }} disabled={loading} className="justify-start">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Rewrite
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { void handleExplain(); }} disabled={loading} className="justify-start">
                            <HelpCircle className="w-4 h-4 mr-2" />
                            Explain
                        </Button>
                        {/* TODO: Add Translate and Clarify buttons/hooks */}
                    </div>
                </div>
                {/* Response Area */}
                {aiResponse && (
                    <div className="bg-muted p-3 rounded-md text-sm animate-in fade-in slide-in-from-bottom-2">
                        <p>{aiResponse}</p>
                    </div>
                )}
                <div className="border-t my-4" />
                {/* Settings */}
                <div className="space-y-4">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Preferences
                    </h4>
                    <div className="space-y-2">
                        <Label>Tone</Label>
                        <Select
                            value={settings.tone}
                            onValueChange={(v: any) => setSettings({ tone: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="friendly">Friendly</SelectItem>
                                <SelectItem value="neutral">Neutral</SelectItem>
                                <SelectItem value="formal">Formal</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Reading Level</Label>
                        <Select
                            value={settings.readingLevel}
                            onValueChange={(v: any) => setSettings({ readingLevel: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="simple">Simple</SelectItem>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="professional">Professional</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Language</Label>
                        <Select
                            value={settings.language}
                            onValueChange={(v: any) => setSettings({ language: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="es">Spanish</SelectItem>
                                <SelectItem value="fr">French</SelectItem>
                                <SelectItem value="de">German</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="adaptive-mode">Auto-Adapt</Label>
                        <Switch
                            id="adaptive-mode"
                            checked={settings.allowAdaptivePrompts}
                            onCheckedChange={(checked) => setSettings({ allowAdaptivePrompts: checked })}
                        />
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};