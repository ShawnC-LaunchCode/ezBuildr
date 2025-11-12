/**
 * JSON Viewer Component
 * Stage 8: Simple JSON viewer with syntax highlighting and copy functionality
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: any;
  className?: string;
  maxHeight?: string;
}

export function JsonViewer({ data, className, maxHeight = '400px' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={cn("relative p-4", className)}>
      <div className="absolute top-2 right-2 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 px-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>

      <pre
        className="text-sm font-mono overflow-auto bg-muted/30 p-3 rounded-md"
        style={{ maxHeight }}
      >
        <code>{jsonString}</code>
      </pre>
    </Card>
  );
}

interface CollapsibleJsonViewerProps {
  data: any;
  title: string;
  className?: string;
}

export function CollapsibleJsonViewer({ data, title, className }: CollapsibleJsonViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="mb-2"
      >
        {isExpanded ? 'Hide' : 'Show'} {title}
      </Button>

      {isExpanded && <JsonViewer data={data} />}
    </div>
  );
}
