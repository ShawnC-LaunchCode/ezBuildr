/**
 * Helper Library Documentation Component
 * Shared documentation for the helper functions available in JS blocks and hooks
 */

import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function HelperLibraryDocs() {
  const [showExamples, setShowExamples] = useState(false);

  return (
    <Collapsible open={showExamples} onOpenChange={setShowExamples}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs"
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            Helper Functions & Examples
          </span>
          {showExamples ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold">Helper Library (40+ Functions)</h4>
            <p className="text-xs text-muted-foreground">
              Access utility functions via the <code className="font-mono text-[10px] bg-background px-1 py-0.5 rounded">helpers</code> object:
            </p>
            <div className="space-y-1 text-[10px] font-mono bg-background p-2 rounded">
              <div><span className="text-primary">helpers.date</span>.now(), .add(), .format(), .parse()</div>
              <div><span className="text-primary">helpers.string</span>.upper(), .lower(), .trim(), .replace()</div>
              <div><span className="text-primary">helpers.number</span>.round(), .currency(), .clamp()</div>
              <div><span className="text-primary">helpers.array</span>.unique(), .flatten(), .sortBy(), .groupBy()</div>
              <div><span className="text-primary">helpers.object</span>.pick(), .omit(), .merge()</div>
              <div><span className="text-primary">helpers.math</span>.sum(), .avg(), .min(), .max(), .random()</div>
              <div><span className="text-primary">helpers.console</span>.log(), .warn(), .error()</div>
              <div><span className="text-primary">helpers.http</span>.get(), .post() <span className="text-muted-foreground">(server-proxied)</span></div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold">List Manipulation Examples</h4>
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Filter list rows:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`const filtered = input.myList.rows.filter(row =>
  row.status === 'active'
);
return { ...input.myList, rows: filtered, count: filtered.length };`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Get list count:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`return input.myList.count;`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Map over list rows:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`const names = input.myList.rows.map(row =>
  row.firstName + ' ' + row.lastName
);
return names;`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Sort list by column:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`const sorted = helpers.array.sortBy(
  input.myList.rows,
  'columnId'
);
return { ...input.myList, rows: sorted };`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Calculate total from list:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`const total = helpers.math.sum(
  input.myList.rows.map(r => r.price)
);
return total;`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Group by column:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`const grouped = helpers.array.groupBy(
  input.myList.rows,
  'category'
);
return grouped;`}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold">Date & String Operations</h4>
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Format date:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`return helpers.date.format(
  input.submittedDate,
  'MMMM dd, yyyy'
);`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Add days to date:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`return helpers.date.add(
  input.startDate,
  { days: 7 }
);`}
                </pre>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Combine strings:</p>
                <pre className="text-[10px] font-mono bg-background p-2 rounded overflow-x-auto">
{`return helpers.string.trim(input.firstName) +
  ' ' +
  helpers.string.trim(input.lastName);`}
                </pre>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold">Security & Safety</h4>
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div>• Sandboxed execution (no file system, network, or process access)</div>
              <div>• HTTP requests proxied through backend with URL validation</div>
              <div>• Timeout enforced (100-3000ms configurable)</div>
              <div>• Console output captured for debugging</div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
