/**
 * The code field for every JavaScript authoring surface (CB-8).
 *
 * Replaces the plain `<Textarea>` this component used to be. Monaco itself is
 * behind `React.lazy` so it costs nothing until an author opens an editor, and
 * the theme follows the app's `dark` class rather than a prop, because the
 * class can change under a mounted editor (the preference toggle, or the OS
 * theme flipping while `system` is selected).
 */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { CodeEditorHandle, CodeEditorLanguage, CodeEditorMarker } from "./codeEditorTypes";

const MonacoCodeField = lazy(() => import("./MonacoCodeField"));

/** The one example an author should copy: `emit(...)`, never `return {...}`. */
export const CODE_BLOCK_PLACEHOLDER = [
    "// Example:",
    "// emit({ full_name: input.first_name + ' ' + input.last_name });",
    "",
    "// Or compute a value:",
    "// emit({ total: input.price * input.quantity });",
].join("\n");

/**
 * The Python sandbox injects the same four names (`input`, `context`, `helpers`,
 * `emit`), so only the syntax changes -- but showing an author JavaScript comments
 * in a Python editor teaches them the wrong contract.
 */
export const CODE_BLOCK_PLACEHOLDER_PYTHON = [
    "# Example:",
    "# emit({ 'full_name': input['first_name'] + ' ' + input['last_name'] })",
    "",
    "# Or compute a value:",
    "# emit({ 'total': input['price'] * input['quantity'] })",
].join("\n");

export const CODE_BLOCK_PLACEHOLDERS: Record<CodeEditorLanguage, string> = {
    javascript: CODE_BLOCK_PLACEHOLDER,
    python: CODE_BLOCK_PLACEHOLDER_PYTHON,
};

/** Tracks the `dark` class on <html>, which is where useUserPreferences puts it. */
export function useIsDarkTheme(): boolean {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains("dark"));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => { observer.disconnect(); };
    }, []);
    return isDark;
}

interface JSCodeEditorProps {
    code: string;
    onChange: (code: string) => void;
    /** Rendered over an empty editor; Monaco has no native placeholder. */
    placeholder?: string;
    ariaLabel?: string;
    className?: string;
    markers?: CodeEditorMarker[];
    /** Which grammar to highlight. Defaults to JavaScript (CB-11). */
    language?: CodeEditorLanguage;
    onReady?: (handle: CodeEditorHandle) => void;
}

const NO_MARKERS: CodeEditorMarker[] = [];

export function JSCodeEditor({
    code,
    onChange,
    placeholder,
    ariaLabel,
    className,
    markers = NO_MARKERS,
    language = "javascript",
    onReady,
}: JSCodeEditorProps): JSX.Element {
    // Defaulted here rather than in the parameter list: both fall back to a
    // LANGUAGE-dependent value, which a parameter default cannot express.
    const resolvedPlaceholder = placeholder ?? CODE_BLOCK_PLACEHOLDERS[language];
    const resolvedAriaLabel = ariaLabel ?? (language === "python" ? "Python code" : "JavaScript code");
    const isDark = useIsDarkTheme();
    const handleChange = useCallback((next: string) => { onChange(next); }, [onChange]);

    return (
        <div
            className={cn(
                "relative h-full overflow-hidden rounded-md border bg-card",
                "focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30",
                className
            )}
        >
            <Suspense fallback={<EditorSkeleton />}>
                <MonacoCodeField
                    code={code}
                    onChange={handleChange}
                    isDark={isDark}
                    ariaLabel={resolvedAriaLabel}
                    markers={markers}
                    language={language}
                    onReady={onReady}
                />
            </Suspense>
            {code === "" && (
                <pre
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[62px] top-3 whitespace-pre font-mono text-[13px] leading-5 text-muted-foreground/70"
                >
                    {resolvedPlaceholder}
                </pre>
            )}
        </div>
    );
}

function EditorSkeleton(): JSX.Element {
    return (
        <div className="space-y-2 p-3">
            {[80, 55, 68, 40].map((width) => (
                <Skeleton key={width} className="h-4" style={{ width: `${width}%` }} />
            ))}
        </div>
    );
}
