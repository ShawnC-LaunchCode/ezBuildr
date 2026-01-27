import { Briefcase, ClipboardCheck, FileText, HelpCircle, ListChecks, MessageSquare, UserPlus } from "lucide-react";
import React from "react";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type WorkflowCategory =
  | 'application'
  | 'survey'
  | 'intake'
  | 'onboarding'
  | 'request'
  | 'checklist'
  | 'general';

interface WorkflowCategorySelectProps {
  value: WorkflowCategory;
  onChange: (value: WorkflowCategory) => void;
  disabled?: boolean;
}

const CATEGORIES: Array<{
  value: WorkflowCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'general',
    label: 'General',
    description: 'Generic workflow - no specific domain',
    icon: FileText,
  },
  {
    value: 'application',
    label: 'Application',
    description: 'Job apps, loan apps, permits, registrations',
    icon: Briefcase,
  },
  {
    value: 'survey',
    label: 'Survey',
    description: 'Feedback, NPS, satisfaction, polls',
    icon: MessageSquare,
  },
  {
    value: 'intake',
    label: 'Intake',
    description: 'Client intake, patient intake, consultations',
    icon: UserPlus,
  },
  {
    value: 'onboarding',
    label: 'Onboarding',
    description: 'Employee, customer, vendor onboarding',
    icon: ListChecks,
  },
  {
    value: 'request',
    label: 'Request',
    description: 'IT requests, PTO, expense, support tickets',
    icon: HelpCircle,
  },
  {
    value: 'checklist',
    label: 'Checklist',
    description: 'Compliance, inspections, audits',
    icon: ClipboardCheck,
  },
];

export function WorkflowCategorySelect({ value, onChange, disabled }: WorkflowCategorySelectProps) {
  const selectedCategory = CATEGORIES.find(c => c.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor="category">Workflow Type</Label>
      <Select value={value} onValueChange={(v) => onChange(v as WorkflowCategory)} disabled={disabled}>
        <SelectTrigger id="category" className="w-full">
          <SelectValue placeholder="Select a category">
            {selectedCategory && (
              <span className="flex items-center gap-2">
                <selectedCategory.icon className="h-4 w-4 text-muted-foreground" />
                {selectedCategory.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((category) => (
            <SelectItem key={category.value} value={category.value}>
              <div className="flex items-center gap-3">
                <category.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col">
                  <span className="font-medium">{category.label}</span>
                  <span className="text-xs text-muted-foreground">{category.description}</span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedCategory && selectedCategory.value !== 'general' && (
        <p className="text-xs text-muted-foreground">
          {selectedCategory.description}
        </p>
      )}
    </div>
  );
}

export default WorkflowCategorySelect;
