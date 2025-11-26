/**
 * URL Parameters Documentation Page
 * Explains how to use default values and URL parameter overrides
 */

import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function UrlParametersDoc() {
  const [, navigate] = useLocation();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const examples = [
    {
      title: "Simple Text Values",
      url: "?firstName=John&lastName=Doe&email=john@example.com",
      description: "Pre-fill text fields with simple string values"
    },
    {
      title: "Numbers and Booleans",
      url: "?age=30&subscribe=true&quantity=5",
      description: "Numbers and booleans are automatically parsed"
    },
    {
      title: "Yes/No Questions",
      url: "?agreeToTerms=yes&wantsNewsletter=no",
      description: "Use 'yes' or 'no' for yes/no question types"
    },
    {
      title: "Date and Time",
      url: "?startDate=2025-01-15&appointmentTime=2025-01-15T14:30",
      description: "Use ISO 8601 format for dates and times"
    },
    {
      title: "Multiple Choice (Array)",
      url: '?interests=["Technology","Sports","Music"]',
      description: "Use JSON array format for multiple selections (URL encode for safety)"
    },
    {
      title: "Using Step Aliases",
      url: "?firstName=John&companyName=Acme%20Corp&role=Manager",
      description: "Use the step's alias (set in builder) as the parameter name"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.close()}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-4xl font-bold mb-2">Default Values & URL Parameters</h1>
          <p className="text-lg text-muted-foreground">
            Learn how to pre-fill workflow fields using default values and URL parameters
          </p>
        </div>

        <Separator className="mb-8" />

        {/* Overview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>How default values and URL parameters work together</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Priority System</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li><strong className="text-foreground">URL Parameters</strong> (Highest priority) - Values passed in the URL override everything</li>
                <li><strong className="text-foreground">Step Default Values</strong> - Values set in the builder when editing a step</li>
                <li><strong className="text-foreground">Empty</strong> - No value if neither above is provided</li>
              </ol>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm">
                <strong>Example:</strong> If a step has default value "Guest" but the URL includes <code className="bg-background px-1 py-0.5 rounded">?firstName=John</code>,
                the field will show "John" instead of "Guest".
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Setting Default Values */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Setting Default Values in the Builder</CardTitle>
            <CardDescription>Configure default values for your workflow steps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>Open your workflow in the builder</li>
              <li>Select a step/question</li>
              <li>In the Properties panel (right side), find the <strong>"Default Value"</strong> field</li>
              <li>Enter the value you want to appear by default</li>
              <li>The value will be pre-filled when someone starts the workflow</li>
            </ol>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Supported for all step types:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Text fields:</strong> Any string value</li>
                <li>• <strong>Yes/No:</strong> "yes", "no", "true", or "false"</li>
                <li>• <strong>Radio:</strong> Exact text of one option</li>
                <li>• <strong>Multiple Choice:</strong> JSON array like ["Option 1", "Option 2"]</li>
                <li>• <strong>Date/Time:</strong> ISO format like "2025-01-15" or "2025-01-15T14:30"</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* URL Parameters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Using URL Parameters</CardTitle>
            <CardDescription>Override defaults by passing values in the URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Basic Format</h3>
              <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                https://your-app.com/workflows/your-workflow<span className="text-primary">?key1=value1&key2=value2</span>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Parameter Names</h3>
              <p className="text-sm text-muted-foreground mb-2">
                You can use either the step's <strong>alias</strong> (recommended) or <strong>step ID</strong> as the parameter name:
              </p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• <strong>Alias:</strong> <code className="bg-background px-1 py-0.5 rounded">?firstName=John</code> (human-readable, set in builder)</li>
                <li>• <strong>Step ID:</strong> <code className="bg-background px-1 py-0.5 rounded">?123e4567-e89b-12d3-a456-426614174000=John</code> (UUID)</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Examples</h3>
              <div className="space-y-4">
                {examples.map((example, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-sm">{example.title}</h4>
                        <p className="text-xs text-muted-foreground">{example.description}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(example.url, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <code className="block bg-muted p-2 rounded text-xs overflow-x-auto">
                      {example.url}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Tips */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Advanced Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">1. URL Encoding</h3>
              <p className="text-muted-foreground mb-2">
                Special characters and spaces need to be URL-encoded:
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Space → <code className="bg-background px-1 py-0.5 rounded">%20</code></li>
                <li>• @ → <code className="bg-background px-1 py-0.5 rounded">%40</code></li>
                <li>• Brackets [ ] → <code className="bg-background px-1 py-0.5 rounded">%5B %5D</code></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">2. Complex Values (JSON)</h3>
              <p className="text-muted-foreground mb-2">
                For arrays or objects, use JSON format and URL-encode:
              </p>
              <code className="block bg-muted p-2 rounded text-xs overflow-x-auto">
                ?tags=%5B%22urgent%22%2C%22follow-up%22%5D
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                This decodes to: <code className="bg-background px-1 py-0.5 rounded">?tags=["urgent","follow-up"]</code>
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">3. Reserved Parameters</h3>
              <p className="text-muted-foreground">
                These parameters are filtered out and won't pre-fill steps:
              </p>
              <code className="block bg-muted p-2 rounded text-xs mt-2">
                ref, source, utm_source, utm_medium, utm_campaign
              </code>
            </div>

            <div>
              <h3 className="font-semibold mb-2">4. Setting Step Aliases</h3>
              <p className="text-muted-foreground">
                To use human-readable parameter names:
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-muted-foreground">
                <li>Select a step in the builder</li>
                <li>Find the "Alias" field in the Properties panel</li>
                <li>Enter a unique name like "firstName" or "companyName"</li>
                <li>Use this name in your URL parameters</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Use Cases */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Common Use Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-1">Email Campaigns</h3>
                <p className="text-muted-foreground">
                  Pre-fill recipient details from your CRM: <code className="bg-background px-1 py-0.5 rounded">?email=john@example.com&name=John</code>
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-1">Customer Support</h3>
                <p className="text-muted-foreground">
                  Include ticket info: <code className="bg-background px-1 py-0.5 rounded">?ticketId=12345&category=Technical</code>
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-1">Event Registration</h3>
                <p className="text-muted-foreground">
                  Pass event details: <code className="bg-background px-1 py-0.5 rounded">?eventName=Summit%202025&attendeeType=VIP</code>
                </p>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold mb-1">Product Inquiries</h3>
                <p className="text-muted-foreground">
                  Include product info: <code className="bg-background px-1 py-0.5 rounded">?productId=ABC123&quantity=5</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center py-8 border-t">
          <p className="text-sm text-muted-foreground mb-4">
            Need more help? Check out the full VaultLogic documentation
          </p>
          <div className="flex gap-4 justify-center">
            <Button
              variant="outline"
              onClick={() => window.close()}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Builder
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
