interface JsonViewerProps {
    data: any;
    className?: string;
}

export function JsonViewer({ data, className }: JsonViewerProps) {
    return (
        <pre
            className={`${className} bg-muted text-foreground p-4 m-0 rounded-md text-xs font-mono overflow-auto whitespace-pre-wrap break-words`}
            style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
        >
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}
