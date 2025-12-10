
/**
 * Stage 21: Template Management Panel
 *
 * UI for managing templates attached to workflow versions.
 * Features:
 * - View all attached templates
 * - Attach/detach templates
 * - Set template keys
 * - Mark primary template
 * - Upload new templates (AI Wizard)
 * - Configure template bindings
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { FileText, Plus, Upload, Trash2, Star, StarOff, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { DocumentTemplateEditor } from './DocumentTemplateEditor';
import { TemplateUploadWizard } from './TemplateUploadWizard';

interface WorkflowTemplate {
  id: string;
  workflowVersionId: string;
  templateId: string;
  key: string;
  isPrimary: boolean;
  createdAt: string;
  template?: {
    id: string;
    name: string;
    description?: string;
    type: 'docx' | 'html';
    fileRef: string;
  };
}

interface Template {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  type: 'docx' | 'html';
  fileRef: string;
  createdAt: string;
}

interface TemplateManagementPanelProps {
  workflowId: string;
  versionId: string;
  projectId: string;
}

export function TemplateManagementPanel({
  workflowId,
  versionId,
  projectId,
}: TemplateManagementPanelProps) {
  const queryClient = useQueryClient();

  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateKey, setTemplateKey] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [editingTemplateContentId, setEditingTemplateContentId] = useState<string | null>(null);
  const [isUploadWizardOpen, setIsUploadWizardOpen] = useState(false);

  // Fetch attached templates
  const { data: attachedTemplates, isLoading: loadingAttached } = useQuery({
    queryKey: ['workflow-templates', versionId],
    queryFn: async () => {
      const response = await fetch(
        `/api/workflows/${workflowId}/versions/${versionId}/templates`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const json = await response.json();
      return json.data as WorkflowTemplate[];
    },
  });

  // Fetch available templates from project
  const { data: projectTemplates, isLoading: loadingProject } = useQuery({
    queryKey: ['project-templates', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/templates`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch project templates');
      }

      const json = await response.json();
      return json.data as Template[];
    },
  });

  // Attach template mutation
  const attachMutation = useMutation({
    mutationFn: async (data: {
      templateId: string;
      projectId: string;
      key: string;
      isPrimary: boolean;
    }) => {
      const response = await fetch(
        `/api/workflows/${workflowId}/versions/${versionId}/templates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to attach template');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', versionId] });
      setIsAttachDialogOpen(false);
      setSelectedTemplateId('');
      setTemplateKey('');
      setIsPrimary(false);
      toast.success('Template attached successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Detach template mutation
  const detachMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const response = await fetch(
        `/api/workflow-templates/${mappingId}?workflowVersionId=${versionId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to detach template');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', versionId] });
      toast.success('Template detached successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Set primary mutation
  const setPrimaryMutation = useMutation({
    mutationFn: async (mappingId: string) => {
      const response = await fetch(
        `/api/workflow-templates/${mappingId}/set-primary?workflowVersionId=${versionId}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to set primary template');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', versionId] });
      toast.success('Primary template updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleAttach = () => {
    if (!selectedTemplateId || !templateKey) {
      toast.error('Please select a template and enter a key');
      return;
    }

    attachMutation.mutate({
      templateId: selectedTemplateId,
      projectId,
      key: templateKey,
      isPrimary,
    });
  };

  const handleDetach = (mappingId: string) => {
    if (confirm('Are you sure you want to detach this template?')) {
      detachMutation.mutate(mappingId);
    }
  };

  const handleSetPrimary = (mappingId: string) => {
    setPrimaryMutation.mutate(mappingId);
  };

  // Filter out already attached templates
  const availableTemplates = projectTemplates?.filter(
    (template) =>
      !attachedTemplates?.some((attached) => attached.templateId === template.id)
  );

  return (
    <div className="p-4 border-l bg-gray-50 dark:bg-gray-900 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Templates
        </h2>

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setIsUploadWizardOpen(true)}>
            <Upload className="h-4 w-4" />
          </Button>
          <Dialog open={isAttachDialogOpen} onOpenChange={setIsAttachDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                Attach
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Attach Template to Workflow</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="template">Template</Label>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={(value) => {
                      setSelectedTemplateId(value);
                      // Auto-fill the display name with the template name
                      const template = availableTemplates?.find((t) => t.id === value);
                      if (template && !templateKey) {
                        setTemplateKey(template.name);
                      }
                    }}
                  >
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates?.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {loadingProject && <p className="text-sm text-gray-500">Loading templates...</p>}
                  {availableTemplates?.length === 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 mb-2">
                        No available templates. Upload templates to your project first.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="key">Display Name</Label>
                  <Input
                    id="key"
                    placeholder="e.g., engagement_letter, schedule_a"
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                  />
                  <p className="text-sm text-gray-500">
                    Unique identifier for this template (used in Template nodes)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="primary"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="primary" className="cursor-pointer">
                    Set as primary template
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAttachDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAttach} disabled={attachMutation.isPending}>
                  {attachMutation.isPending ? 'Attaching...' : 'Attach Template'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loadingAttached ? (
        <div className="text-center py-8 text-gray-500">Loading templates...</div>
      ) : attachedTemplates?.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No templates attached</p>
          <p className="text-sm">Click "Attach" to add a template</p>
        </div>
      ) : (
        <div className="space-y-3">
          {attachedTemplates?.map((mapping) => (
            <div
              key={mapping.id}
              className="p-3 bg-white dark:bg-gray-800 rounded-lg border shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{mapping.template?.name || 'Unknown'}</h3>
                    {mapping.isPrimary && (
                      <Badge variant="default" className="text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Key: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{mapping.key}</code>
                  </p>
                  {mapping.template?.description && (
                    <p className="text-xs text-gray-500 mt-1">{mapping.template.description}</p>
                  )}
                </div>

                <div className="flex gap-1">
                  {!mapping.isPrimary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleSetPrimary(mapping.id)}
                      title="Set as primary"
                    >
                      <StarOff className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDetach(mapping.id)}
                    title="Detach template"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTemplateContentId(mapping.templateId)}
                    title="AI Assist & Edit"
                  >
                    <Settings className="h-4 w-4 text-purple-500" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Badge variant="outline" className="text-xs">
                  {mapping.template?.type?.toUpperCase() || 'DOCX'}
                </Badge>
                <span>•</span>
                <span>{new Date(mapping.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          💡 <strong>Tip:</strong> Use template keys in Template nodes to reference these
          templates. The primary template will be used by default.
        </p>
      </div>

      {editingTemplateContentId && (
        <DocumentTemplateEditor
          templateId={editingTemplateContentId}
          isOpen={!!editingTemplateContentId}
          onClose={() => setEditingTemplateContentId(null)}
          workflowVariables={[]} // TODO: Pass actual workflow variables
        />
      )}

      <TemplateUploadWizard
        projectId={projectId}
        open={isUploadWizardOpen}
        onOpenChange={setIsUploadWizardOpen}
      />
    </div>
  );
}
