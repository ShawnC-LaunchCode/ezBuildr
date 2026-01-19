/**
 * NodeSidebar - Inspector panel for node configuration
 */
import { Trash2, Plus, X } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { FinalBlockEditor } from '@/components/blocks/FinalBlockEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBuilderStore } from '../store/useBuilderStore';
import { ExpressionEditor } from './ExpressionEditor';
import { ExpressionToolbar } from './ExpressionToolbar';
export function NodeSidebar() {
  const { id: workflowId } = useParams<{ id: string }>();
  const { nodes, selectedNodeId, updateNode, deleteNode } = useBuilderStore();
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const [localConfig, setLocalConfig] = useState<any>({});
  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(selectedNode.data.config || {});
    }
  }, [selectedNode]);
  if (!selectedNode) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>Select a node to edit its properties</p>
      </div>
    );
  }
  const handleUpdate = (updates: any) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    updateNode(selectedNode.id, { config: newConfig });
  };
  const handleLabelUpdate = (label: string) => {
    updateNode(selectedNode.id, { label });
  };
  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this node?')) {
      deleteNode(selectedNode.id);
    }
  };
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Node Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Node Properties</CardTitle>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Node Type</Label>
            <Badge>{selectedNode.type}</Badge>
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={selectedNode.data.label}
              onChange={(e) => handleLabelUpdate(e.target.value)}
              placeholder="Node label"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condition">Condition (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Node will only execute if condition evaluates to true
            </p>
            {workflowId && selectedNode && (
              <>
                <ExpressionToolbar
                  workflowId={workflowId}
                  nodeId={selectedNode.id}
                  onInsert={(text) => {
                    const currentValue = localConfig.condition || '';
                    handleUpdate({ condition: currentValue + text });
                  }}
                />
                <ExpressionEditor
                  value={localConfig.condition || ''}
                  onChange={(value) => handleUpdate({ condition: value })}
                  nodeId={selectedNode.id}
                  workflowId={workflowId}
                  placeholder="e.g., age > 18"
                  height="80px"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Node Type-Specific Config */}
      {selectedNode.type === 'question' && (
        <QuestionConfig config={localConfig} onUpdate={handleUpdate} />
      )}
      {selectedNode.type === 'compute' && workflowId && (
        <ComputeConfig
          config={localConfig}
          onUpdate={handleUpdate}
          workflowId={workflowId}
          nodeId={selectedNode.id}
        />
      )}
      {selectedNode.type === 'branch' && workflowId && (
        <BranchConfig
          config={localConfig}
          onUpdate={handleUpdate}
          workflowId={workflowId}
          nodeId={selectedNode.id}
        />
      )}
      {selectedNode.type === 'template' && workflowId && (
        <TemplateConfig
          config={localConfig}
          onUpdate={handleUpdate}
          workflowId={workflowId}
          nodeId={selectedNode.id}
        />
      )}
      {selectedNode.type === 'final' && workflowId && (
        <FinalBlockEditor
          config={localConfig}
          onUpdate={handleUpdate}
          workflowId={workflowId}
          nodeId={selectedNode.id}
        />
      )}
    </div>
  );
}
// Question Node Config
function QuestionConfig({ config, onUpdate }: { config: any; onUpdate: (updates: any) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Question Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="key">Variable Key</Label>
          <Input
            id="key"
            value={config.key || ''}
            onChange={(e) => onUpdate({ key: e.target.value })}
            placeholder="e.g., user_age"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inputType">Input Type</Label>
          <Select
            value={config.inputType || 'text'}
            onValueChange={(value) => onUpdate({ inputType: value })}
          >
            <SelectTrigger id="inputType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="select">Select</SelectItem>
              <SelectItem value="multiselect">Multi-Select</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="required"
            checked={config.required || false}
            onCheckedChange={(checked) => onUpdate({ required: checked })}
          />
          <Label htmlFor="required" className="cursor-pointer">
            Required field
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
// Compute Node Config
function ComputeConfig({
  config,
  onUpdate,
  workflowId,
  nodeId,
}: {
  config: any;
  onUpdate: (updates: any) => void;
  workflowId: string;
  nodeId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compute Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="expression">Expression</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Use variables from previous nodes
          </p>
          <ExpressionToolbar
            workflowId={workflowId}
            nodeId={nodeId}
            onInsert={(text) => {
              const currentValue = config.expression || '';
              onUpdate({ expression: currentValue + text });
            }}
          />
          <ExpressionEditor
            value={config.expression || ''}
            onChange={(value) => onUpdate({ expression: value })}
            nodeId={nodeId}
            workflowId={workflowId}
            placeholder="e.g., age * 2 + 10"
            height="100px"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="outputKey">Output Variable</Label>
          <Input
            id="outputKey"
            value={config.outputKey || ''}
            onChange={(e) => onUpdate({ outputKey: e.target.value })}
            placeholder="e.g., calculated_value"
            className="font-mono"
          />
        </div>
      </CardContent>
    </Card>
  );
}
// Branch Node Config
function BranchConfig({
  config,
  onUpdate,
  workflowId,
  nodeId,
}: {
  config: any;
  onUpdate: (updates: any) => void;
  workflowId: string;
  nodeId: string;
}) {
  const branches = config.branches || [];
  const addBranch = () => {
    const newBranches = [...branches, { condition: '', label: `Branch ${branches.length + 1}` }];
    onUpdate({ branches: newBranches });
  };
  const updateBranch = (index: number, updates: any) => {
    const newBranches = [...branches];
    newBranches[index] = { ...newBranches[index], ...updates };
    onUpdate({ branches: newBranches });
  };
  const removeBranch = (index: number) => {
    const newBranches = branches.filter((_: any, i: number) => i !== index);
    onUpdate({ branches: newBranches });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Branch Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {branches.map((branch: any, index: number) => (
            <Card key={index} className="p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Branch {index + 1}</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBranch(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <Input
                  value={branch.label || ''}
                  onChange={(e) => updateBranch(index, { label: e.target.value })}
                  placeholder="Branch label"
                  className="text-sm"
                />
                <Label className="text-xs">Condition</Label>
                <ExpressionEditor
                  value={branch.condition || ''}
                  onChange={(value) => updateBranch(index, { condition: value })}
                  nodeId={nodeId}
                  workflowId={workflowId}
                  placeholder="e.g., age >= 18"
                  height="60px"
                />
              </div>
            </Card>
          ))}
        </div>
        <Button onClick={addBranch} variant="outline" className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Branch
        </Button>
      </CardContent>
    </Card>
  );
}
// Template Node Config
function TemplateConfig({
  config,
  onUpdate,
  workflowId,
  nodeId,
}: {
  config: any;
  onUpdate: (updates: any) => void;
  workflowId: string;
  nodeId: string;
}) {
  const bindings = config.bindings || {};
  const addBinding = () => {
    const placeholder = prompt('Enter placeholder name:');
    if (placeholder) {
      onUpdate({
        bindings: {
          ...bindings,
          [placeholder]: '',
        },
      });
    }
  };
  const updateBinding = (placeholder: string, expression: string) => {
    onUpdate({
      bindings: {
        ...bindings,
        [placeholder]: expression,
      },
    });
  };
  const removeBinding = (placeholder: string) => {
    const newBindings = { ...bindings };
    delete newBindings[placeholder];
    onUpdate({ bindings: newBindings });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Template Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="templateId">Template ID</Label>
          <Input
            id="templateId"
            value={config.templateId || ''}
            onChange={(e) => onUpdate({ templateId: e.target.value })}
            placeholder="Enter template ID"
          />
        </div>
        <div className="space-y-2">
          <Label>Placeholder Bindings</Label>
          <div className="space-y-2">
            {Object.entries(bindings).map(([placeholder, expression]) => (
              <Card key={placeholder} className="p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-mono">{placeholder}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBinding(placeholder)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <ExpressionEditor
                    value={expression as string}
                    onChange={(value) => updateBinding(placeholder, value)}
                    nodeId={nodeId}
                    workflowId={workflowId}
                    placeholder="Expression or variable"
                    height="60px"
                  />
                </div>
              </Card>
            ))}
          </div>
          <Button onClick={addBinding} variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Binding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}