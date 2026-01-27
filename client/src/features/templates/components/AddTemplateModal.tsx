import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Loader2, FileText } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useConfetti } from "@/hooks/useConfetti";
interface Template {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
}
interface AddTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surveyId: string;
}
export function AddTemplateModal({ open, onOpenChange, surveyId }: AddTemplateModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const { fire } = useConfetti();
  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const response = await axios.get<Template[]>("/api/templates");
      return response.data;
    },
    enabled: open,
  });
  // Insert template mutation
  const insertTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await axios.post(
        `/api/templates/${templateId}/insert/${surveyId}`
      );
      return response.data;
    },
    onSuccess: (data) => {
      fire("party");
      toast({
        title: "Template added successfully",
        description: `${data.pagesAdded} page(s) and ${data.questionsAdded} question(s) added from "${data.templateName}"`,
      });
      // Invalidate survey queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["survey", surveyId] });
      queryClient.invalidateQueries({ queryKey: ["surveyPages", surveyId] });
      // Close modal
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error adding template",
        description: error.response?.data?.message || "Failed to add template to survey",
        variant: "destructive",
      });
    },
  });
  const handleClose = () => {
    setSelectedTemplateId(null);
    onOpenChange(false);
  };
  const handleInsertTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    insertTemplate.mutate(templateId);
  };
  // Separate system and user templates
  const systemTemplates = templates.filter(t => t.isSystem);
  const userTemplates = templates.filter(t => !t.isSystem);
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        aria-describedby="template-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Add from Template
          </DialogTitle>
          <DialogDescription id="template-description">
            Insert pages and questions from a saved template into this survey
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading templates...</span>
            </div>
          )}
          {!isLoading && templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No templates available yet</p>
              <p className="text-xs mt-1">
                Save your first template using the "Save as Template" option
              </p>
            </div>
          )}
          <AnimatePresence>
            {!isLoading && systemTemplates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  System Templates
                </h3>
                {systemTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onInsert={handleInsertTemplate}
                    isInserting={insertTemplate.isPending && selectedTemplateId === template.id}
                  />
                ))}
              </motion.div>
            )}
            {!isLoading && userTemplates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  My Templates
                </h3>
                {userTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onInsert={handleInsertTemplate}
                    isInserting={insertTemplate.isPending && selectedTemplateId === template.id}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
interface TemplateCardProps {
  template: Template;
  onInsert: (id: string) => void;
  isInserting: boolean;
}
function TemplateCard({ template, onInsert, isInserting }: TemplateCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors group"
    >
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm truncate">{template.name}</h4>
          {template.isSystem && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              System
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {template.description}
          </p>
        )}
      </div>
      <Button
        size="sm"
        onClick={() => { void onInsert(template.id); }}
        disabled={isInserting}
        className="gap-2 shrink-0"
      >
        {isInserting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Adding...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Add
          </>
        )}
      </Button>
    </motion.div>
  );
}