/**
 * Toolbar - Add nodes, publish, run preview, version control
 */

import { useState } from 'react';
import { useBuilderStore } from '../store/useBuilderStore';
import { usePublishWorkflow, useWorkflowVersions } from '../hooks/useWorkflowAPI';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Play, Save, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ToolbarProps {
  workflowId: string;
  workflowStatus: 'draft' | 'published' | 'archived';
  onRunPreview: () => void;
}

export function Toolbar({ workflowId, workflowStatus, onRunPreview }: ToolbarProps) {
  const { addNode, isDirty, isSaving, saveError } = useBuilderStore();
  const publishWorkflow = usePublishWorkflow(workflowId);
  const { data: versionsData } = useWorkflowVersions(workflowId);

  const versions = versionsData?.data || [];
  const [selectedVersion, setSelectedVersion] = useState<string>('current');

  const handleAddNode = (type: 'question' | 'compute' | 'branch' | 'template') => {
    // Add node at center of canvas
    const position = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
    };
    addNode(type, position);
  };

  const handlePublish = async () => {
    if (isDirty) {
      alert('Please save your changes before publishing');
      return;
    }

    if (confirm('Are you sure you want to publish this workflow? This will create a new immutable version.')) {
      await publishWorkflow.mutateAsync();
    }
  };

  return (
    <div className="border-b bg-card px-4 py-2 flex items-center justify-between gap-4">
      {/* Left side - Add Node */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Node
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleAddNode('question')}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Question</span>
                <span className="text-xs text-muted-foreground">
                  Collect user input
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode('compute')}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Compute</span>
                <span className="text-xs text-muted-foreground">
                  Calculate values with expressions
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode('branch')}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Branch</span>
                <span className="text-xs text-muted-foreground">
                  Conditional logic flow
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode('template')}>
              <div className="flex flex-col gap-1">
                <span className="font-medium">Template</span>
                <span className="text-xs text-muted-foreground">
                  Generate documents from templates
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Save indicator */}
        <div className="flex items-center gap-2 text-sm">
          {isSaving && (
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3 animate-spin" />
              Saving...
            </Badge>
          )}
          {!isSaving && isDirty && (
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="w-3 h-3 text-orange-500" />
              Unsaved changes
            </Badge>
          )}
          {!isSaving && !isDirty && !saveError && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Saved
            </Badge>
          )}
          {saveError && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="w-3 h-3" />
              Save error
            </Badge>
          )}
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Version selector */}
        {versions.length > 0 && (
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current (Draft)</SelectItem>
              {versions
                .filter(v => v.published)
                .map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    v{version.id.slice(0, 8)} - {new Date(version.publishedAt!).toLocaleDateString()}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        {/* Run Preview */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRunPreview}
        >
          <Play className="w-4 h-4 mr-2" />
          Run Preview
        </Button>

        {/* Publish */}
        <Button
          variant="default"
          size="sm"
          onClick={handlePublish}
          disabled={workflowStatus === 'published' || isDirty || isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          Publish
        </Button>

        {/* Status Badge */}
        <Badge
          variant={workflowStatus === 'published' ? 'default' : 'secondary'}
        >
          {workflowStatus}
        </Badge>
      </div>
    </div>
  );
}
