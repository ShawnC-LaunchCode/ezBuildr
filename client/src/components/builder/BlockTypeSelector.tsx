
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type Mode } from "@/lib/mode";

interface BlockTypeSelectorProps {
    creationMode: 'regular' | 'transform';
    setCreationMode: (mode: 'regular' | 'transform') => void;
    mode: Mode;
}

export function BlockTypeSelector({ creationMode, setCreationMode, mode }: BlockTypeSelectorProps) {
    return (
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border">
            <Label>Block Category:</Label>
            <div className="flex gap-2">
                <Button
                    variant={creationMode === 'regular' ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setCreationMode('regular'); }}
                >
                    Standard Block
                </Button>
                <Button
                    variant={creationMode === 'transform' ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setCreationMode('transform'); }}
                    disabled={mode === 'easy'}
                >
                    Code Transform
                </Button>
            </div>
            {mode === 'easy' && creationMode === 'regular' && (
                <span className="text-xs text-muted-foreground ml-2">Code transforms are an Advanced Mode feature.</span>
            )}
        </div>
    );
}
