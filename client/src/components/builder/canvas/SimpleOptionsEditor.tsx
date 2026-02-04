
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SimpleOptionsEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
    const handleAdd = () => {
        onChange([...options, `Option ${options.length + 1}`]);
    };

    const handleChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        onChange(newOptions);
    };

    const handleRemove = (index: number) => {
        onChange(options.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                    <Input
                        value={option}
                        onChange={(e) => { handleChange(index, e.target.value); }}
                        placeholder={`Option ${index + 1}`}
                    />
                    <Button variant="outline" size="icon" onClick={() => { handleRemove(index); }}>
                        ×
                    </Button>
                </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => { handleAdd(); }} className="w-full">
                Add Option
            </Button>
        </div>
    );
}
