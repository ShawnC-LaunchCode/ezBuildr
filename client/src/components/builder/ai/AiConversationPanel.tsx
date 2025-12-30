import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Sparkles, AlertTriangle, HelpCircle, History, Undo } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  summary?: string[];
  warnings?: string[];
  questions?: AiQuestion[];
  confidence?: number;
  versionId?: string | null;
}

interface AiQuestion {
  id: string;
  prompt: string;
  type: "text" | "single_select" | "multi_select" | "number";
  options?: string[];
  blocking: boolean;
}

interface AiConversationPanelProps {
  workflowId: string;
  onEdit?: (versionId: string) => void;
  onUndo?: (versionId: string) => void;
  onViewDiff?: (versionId: string) => void;
}

export function AiConversationPanel({
  workflowId,
  onEdit,
  onUndo,
  onViewDiff,
}: AiConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/ai/edit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          userMessage: input,
          workflowId,
          preferences: {
            readingLevel: "standard",
            tone: "neutral",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to process AI request: ${response.statusText}`);
      }

      const result = await response.json();
      const data = result.data;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.summary?.join("\n") || "No changes made",
        timestamp: new Date(),
        summary: data.summary,
        warnings: data.warnings,
        questions: data.questions,
        confidence: data.confidence,
        versionId: data.versionId,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Notify parent if edit was successful
      if (data.versionId && onEdit) {
        onEdit(data.versionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = (versionId: string) => {
    if (onUndo) {
      onUndo(versionId);
    }
  };

  const handleViewDiff = (versionId: string) => {
    if (onViewDiff) {
      onViewDiff(versionId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h2 className="font-semibold text-lg">AI Workflow Assistant</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Describe what you want to change, and I'll update the workflow
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-purple-300" />
            <p className="text-sm">Start a conversation to edit your workflow</p>
            <p className="text-xs mt-1">Example: "Add a phone number field to the contact section"</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <Card
              className={cn(
                "max-w-[85%] p-3",
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-white border"
              )}
            >
              {/* Message content */}
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>

              {/* Summary bullets */}
              {message.summary && message.summary.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-semibold mb-2">What changed:</div>
                  <ul className="text-xs space-y-1">
                    {message.summary.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {message.warnings && message.warnings.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1 text-xs font-semibold mb-2 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    Warnings:
                  </div>
                  <ul className="text-xs space-y-1">
                    {message.warnings.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-500">⚠</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Questions */}
              {message.questions && message.questions.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1 text-xs font-semibold mb-2">
                    <HelpCircle className="w-3 h-3" />
                    Questions:
                  </div>
                  <ul className="text-xs space-y-2">
                    {message.questions.map((q) => (
                      <li key={q.id} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{q.prompt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confidence */}
              {message.confidence !== undefined && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-medium">
                      {Math.round(message.confidence * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              {message.versionId && (
                <div className="mt-3 pt-3 border-t flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewDiff(message.versionId!)}
                    className="text-xs"
                  >
                    <History className="w-3 h-3 mr-1" />
                    View Diff
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUndo(message.versionId!)}
                    className="text-xs"
                  >
                    <Undo className="w-3 h-3 mr-1" />
                    Undo
                  </Button>
                </div>
              )}
            </Card>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <Card className="max-w-[85%] p-3 bg-white border">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent" />
                <span>Thinking...</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-white">
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want to change..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
