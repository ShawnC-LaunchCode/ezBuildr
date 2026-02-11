
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SectionGeneralSettingsProps {
    title: string;
    setTitle: (title: string) => void;
    description: string;
    setDescription: (description: string) => void;
}

export function SectionGeneralSettings({
    title,
    setTitle,
    description,
    setDescription
}: SectionGeneralSettingsProps): JSX.Element {
    return (
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Page Title</Label>
                <Input value={title} onChange={(e) => { setTitle(e.target.value); }} />
            </div>
            <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); }}
                    placeholder="Internal description or notes (optional)"
                />
            </div>
        </div>
    );
}
