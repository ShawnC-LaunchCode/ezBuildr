/**
 * Common Editor Field Components
 * Reusable field components for card editors
 */

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface EditorFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

/**
 * Base field wrapper with label and description
 */
export function EditorField({ label, description, error, required, children }: EditorFieldProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
}

/**
 * Text input field
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  description,
  error,
  required,
  maxLength,
}: TextFieldProps) {
  return (
    <EditorField label={label} description={description} error={error} required={required}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn(error && "border-destructive")}
      />
    </EditorField>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  rows?: number;
}

/**
 * Textarea field
 */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  description,
  error,
  required,
  rows = 3,
}: TextAreaFieldProps) {
  return (
    <EditorField label={label} description={description} error={error} required={required}>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(error && "border-destructive")}
      />
    </EditorField>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Number input field
 */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  description,
  error,
  required,
  min,
  max,
  step,
}: NumberFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange(undefined);
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  return (
    <EditorField label={label} description={description} error={error} required={required}>
      <Input
        type="number"
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className={cn(error && "border-destructive")}
      />
    </EditorField>
  );
}

interface SwitchFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

/**
 * Switch toggle field
 */
export function SwitchField({ label, checked, onChange, description }: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  description?: string;
}

/**
 * Section header for grouping fields
 */
export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
