import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
interface JsonViewerProps {
    data: Record<string, any>;
    className?: string;
}
// Hook to detect dark mode from HTML class
function useDarkModeObserver() {
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains("dark"));
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    setIsDark(document.documentElement.classList.contains("dark"));
                }
            });
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);
    return isDark;
}
// Helper to check if two values are effectively different
function isDifferent(val1: any, val2: any): boolean {
    if (val1 === val2) {return false;}
    if (typeof val1 !== typeof val2) {return true;}
    if (typeof val1 === 'object' && val1 !== null && val2 !== null) {
        if (Array.isArray(val1) !== Array.isArray(val2)) {return true;}
        return JSON.stringify(val1) !== JSON.stringify(val2);
    }
    return true;
}
export function JsonViewer({ data, className }: JsonViewerProps) {
    const isDark = useDarkModeObserver();
    const prevDataRef = useRef<Record<string, any>>({});
    const [changedPaths, setChangedPaths] = useState<Map<string, number>>(new Map());
    // Calculate changed paths
    useEffect(() => {
        const prevData = prevDataRef.current;
        const now = Date.now();
        const newChanges = new Map<string, number>();
        // Flatten keys to check changes? Or just recursive check?
        // Simple recursive diff
        function findChanges(current: any, prev: any, path: string) {
            if (isDifferent(current, prev)) {
                newChanges.set(path, now);
            }
            if (typeof current === 'object' && current !== null && typeof prev === 'object' && prev !== null) {
                Object.keys(current).forEach(key => {
                    const nextPath = path ? `${path}.${key}` : key;
                    findChanges(current[key], prev[key], nextPath);
                });
            }
        }
        findChanges(data, prevData, "");
        if (newChanges.size > 0) {
            setChangedPaths(prev => {
                const map = new Map(prev);
                newChanges.forEach((ts, path) => map.set(path, ts));
                return map;
            });
            // Cleanup
            setTimeout(() => {
                setChangedPaths(current => {
                    const threshold = Date.now() - 5000;
                    const map = new Map();
                    current.forEach((ts, path) => {
                        if (ts > threshold) {map.set(path, ts);}
                    });
                    return map;
                });
            }, 5000);
        }
        prevDataRef.current = data;
    }, [data]);
    return (
        <div className={cn("text-xs font-mono h-full w-full overflow-auto p-2 bg-slate-50 dark:bg-slate-950/50", className)}>
            <JsonNode
                name="root"
                value={data}
                isLast={true}
                depth={0}
                path=""
                changedPaths={changedPaths}
                initiallyExpanded={true}
            />
        </div>
    );
}
interface JsonNodeProps {
    name: string | null;
    value: any;
    isLast: boolean;
    depth: number;
    path: string;
    changedPaths: Map<string, number>;
    initiallyExpanded?: boolean;
}
function JsonNode({ name, value, isLast, depth, path, changedPaths, initiallyExpanded = false }: JsonNodeProps) {
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const [copied, setCopied] = useState(false);
    // Highlight logic
    const lastChange = changedPaths.get(path);
    const isHighlighted = lastChange && (Date.now() - lastChange < 2000); // 2s highlight
    const isObject = typeof value === 'object' && value !== null;
    const isArray = Array.isArray(value);
    const isEmpty = isObject && Object.keys(value).length === 0;
    const handleCopy = (e: React.MouseEvent, text: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const getTypeColor = (val: any) => {
        if (val === null) {return "text-rose-500";}
        switch (typeof val) {
            case 'string': return "text-emerald-600 dark:text-emerald-400";
            case 'number': return "text-blue-600 dark:text-blue-400";
            case 'boolean': return "text-purple-600 dark:text-purple-400";
            default: return "text-gray-600 dark:text-gray-400";
        }
    };
    const renderValue = (val: any) => {
        if (val === null) {return "null";}
        if (typeof val === 'string') {return `"${val}"`;}
        return String(val);
    };
    const containerClass = cn(
        "flex items-start group rounded-sm px-1 -ml-1 border border-transparent transition-colors",
        isHighlighted ? "bg-yellow-100 dark:bg-yellow-900/30 duration-500" : "hover:bg-black/5 dark:hover:bg-white/5",
        // isHighlighted ? "animate-category-pulse" : "" 
    );
    if (isObject) {
        const keys = Object.keys(value);
        return (
            <div className="ml-0">
                <div className={containerClass} onClick={() => { void !isEmpty && setExpanded(!expanded); }}>
                    {/* Toggle */}
                    {!isEmpty ? (
                        <span className="cursor-pointer mr-1 mt-0.5 opacity-50 hover:opacity-100">
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </span>
                    ) : <span className="w-4 mr-1"></span>}
                    {/* Key */}
                    {name && (
                        <span className="text-indigo-600 dark:text-indigo-400 mr-1 select-text" onDoubleClick={(e) => handleCopy(e, path)}>
                            {name}:
                        </span>
                    )}
                    {/* Preview */}
                    <span className="text-gray-500 dark:text-gray-400">
                        {isArray ? "[" : "{"}
                        {!expanded && !isEmpty && (
                            <span className="mx-1 text-gray-400 italic">
                                {keys.length} {keys.length === 1 ? 'item' : 'items'}
                            </span>
                        )}
                        {isEmpty && (isArray ? "]" : "}")}
                    </span>
                    {/* Tools */}
                    <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-2">
                        <button onClick={(e) => handleCopy(e, JSON.stringify(value, null, 2))} title="Copy Value">
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />}
                        </button>
                    </div>
                </div>
                {/* Children */}
                {expanded && !isEmpty && (
                    <div className="ml-4 border-l border-gray-200 dark:border-gray-800 pl-2">
                        {keys.map((key, i) => (
                            <JsonNode
                                key={key}
                                name={isArray ? null : key} // Don't show index keys for arrays generally, or do? usually no.
                                // Actually for debugging, index is useful `[0]`. But user prefers cleanly list.
                                // Let's show index if array?
                                value={value[key]}
                                isLast={i === keys.length - 1}
                                depth={depth + 1}
                                path={path ? `${path}.${key}` : key}
                                changedPaths={changedPaths}
                            />
                        ))}
                    </div>
                )}
                {expanded && !isEmpty && (
                    <div className="ml-4 pl-1 text-gray-500 dark:text-gray-400">
                        {isArray ? "]" : "}"}{!isLast && ","}
                    </div>
                )}
            </div>
        )
    }
    // Primitive
    return (
        <div className={containerClass}>
            <span className="w-4 mr-1"></span> {/* Indent spacer for leaves */}
            {name && (
                <span className="text-indigo-600 dark:text-indigo-400 mr-1 select-text" title={path} onDoubleClick={(e) => handleCopy(e, path)}>
                    {name}:
                </span>
            )}
            <span
                className={cn("break-all select-text", getTypeColor(value))}
            >
                {renderValue(value)}
            </span>
            {!isLast && <span className="text-gray-400">,</span>}
            {/* Tools */}
            <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-2">
                <button onClick={(e) => handleCopy(e, String(value))} title="Copy Value">
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />}
                </button>
            </div>
        </div>
    );
}