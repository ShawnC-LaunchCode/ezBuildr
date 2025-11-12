/**
 * NodeSidebar - Inspector panel for node configuration
 */

import { useState, useEffect } from 'react';
import { useBuilderStore } from '../store/useBuilderStore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function NodeSidebar() {
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
            <Textarea
              id="condition"
              value={localConfig.condition || ''}
              onChange={(e) => handleUpdate({ condition: e.target.value })}
              placeholder="e.g., age > 18"
              className="font-mono text-sm"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Node will only execute if condition evaluates to true
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Node Type-Specific Config */}
      {selectedNode.type === 'question' && (
        <QuestionConfig config={localConfig} onUpdate={handleUpdate} />
      )}

      {selectedNode.type === 'compute' && (
        <ComputeConfig config={localConfig} onUpdate={handleUpdate} />
      )}

      {selectedNode.type === 'branch' && (
        <BranchConfig config={localConfig} onUpdate={handleUpdate} />
      )}

      {selectedNode.type === 'template' && (
        <TemplateConfig config={localConfig} onUpdate={handleUpdate} />
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
function ComputeConfig({ config, onUpdate }: { config: any; onUpdate: (updates: any) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compute Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="expression">Expression</Label>
          <Textarea
            id="expression"
            value={config.expression || ''}
            onChange={(e) => onUpdate({ expression: e.target.value })}
            placeholder="e.g., age * 2 + 10"
            className="font-mono text-sm"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Use variables from previous nodes (e.g., $age, $name)
          </p>
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
function BranchConfig({ config, onUpdate }: { config: any; onUpdate: (updates: any) => void }) {
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

                <Textarea
                  value={branch.condition || ''}
                  onChange={(e) => updateBranch(index, { condition: e.target.value })}
                  placeholder="e.g., age >= 18"
                  className="font-mono text-sm"
                  rows={2}
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
function TemplateConfig({ config, onUpdate }: { config: any; onUpdate: (updates: any) => void }) {
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
                  <Textarea
                    value={expression as string}
                    onChange={(e) => updateBinding(placeholder, e.target.value)}
                    placeholder="Expression or variable"
                    className="font-mono text-sm"
                    rows={2}
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
