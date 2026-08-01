/**
 * Shared workflow-creation form (ICW-20).
 *
 * Single source of truth for the "create a workflow" form used by both the
 * NewWorkflow page (manual tab) and the ProjectView create dialog. Uses the
 * stack's React Hook Form + Zod validation so an empty title surfaces as an
 * inline field error (not just a toast). The form owns the create mutation and
 * success/error toasts; the parent decides what happens next via `onCreated`
 * (e.g. navigate to the builder, or close a dialog).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useCreateWorkflow } from "@/lib/vault-hooks";

const createWorkflowSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Workflow title is required")
    .max(255, "Title must be 255 characters or fewer"),
  description: z.string().max(2000, "Description is too long").optional(),
});

type CreateWorkflowValues = z.infer<typeof createWorkflowSchema>;

interface CreateWorkflowFormProps {
  /** When set, the created workflow is filed under this project. */
  projectId?: string | null;
  /** Called with the created workflow (navigate to builder, close a dialog, ...). */
  onCreated?: (workflow: ApiWorkflow) => void;
  /** Renders a Cancel button when provided. */
  onCancel?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
}

export function CreateWorkflowForm({
  projectId,
  onCreated,
  onCancel,
  submitLabel = "Create Workflow",
  autoFocus = false,
}: CreateWorkflowFormProps) {
  const { toast } = useToast();
  const createWorkflow = useCreateWorkflow();

  const form = useForm<CreateWorkflowValues>({
    resolver: zodResolver(createWorkflowSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = async (values: CreateWorkflowValues) => {
    try {
      const description = values.description?.trim();
      const workflow = await createWorkflow.mutateAsync({
        title: values.title.trim(),
        ...(description ? { description } : {}),
        ...(projectId ? { projectId } : {}),
      });
      toast({ title: "Success", description: "Workflow created successfully" });
      onCreated?.(workflow);
    } catch (error) {
      toast({ title: "Error", description: "Failed to create workflow", variant: "destructive" });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Customer Onboarding" autoFocus={autoFocus} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe what this workflow is for..." rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 justify-end pt-4">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={createWorkflow.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {createWorkflow.isPending ? "Creating..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
