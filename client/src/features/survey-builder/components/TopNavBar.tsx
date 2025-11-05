import { useLocation } from "wouter";
import { Eye, Save, Check, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { InlineEditableTitle } from "@/components/shared/InlineEditableTitle";
import type { SaveStatus } from "@/hooks/useAutoSave";
import { formatLastSaved } from "@/hooks/useAutoSave";

interface TopNavBarProps {
  surveyId: string;
  surveyTitle: string;
  isActive: boolean;
  activeTab: string;
  saveStatus?: SaveStatus;
  lastSavedAt?: Date | null;
  hasUnsavedChanges?: boolean;
  onTitleSave: (title: string) => void;
  onActivateToggle: (active: boolean) => void;
  onTabChange: (tab: string) => void;
  onManualSave?: () => void;
}

export function TopNavBar({
  surveyId,
  surveyTitle,
  isActive,
  activeTab,
  saveStatus = "idle",
  lastSavedAt = null,
  hasUnsavedChanges = false,
  onTitleSave,
  onActivateToggle,
  onTabChange,
  onManualSave,
}: TopNavBarProps) {
  const [, navigate] = useLocation();

  // Render save status indicator
  const renderSaveStatus = () => {
    if (saveStatus === "saving") {
      return (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );
    }

    if (saveStatus === "saved") {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <Check className="w-3.5 h-3.5" />
          <span>Saved {formatLastSaved(lastSavedAt)}</span>
        </div>
      );
    }

    if (saveStatus === "error") {
      return (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Save failed</span>
        </div>
      );
    }

    if (hasUnsavedChanges) {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <Save className="w-3.5 h-3.5" />
          <span>Unsaved changes</span>
        </div>
      );
    }

    if (lastSavedAt) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Saved {formatLastSaved(lastSavedAt)}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-white sticky top-0 z-50">
      {/* LEFT - Back Button + Logo + Survey Title + Save Status */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="h-9 w-9 p-0"
          title="Back to surveys"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="font-semibold text-gray-600">Vault-Logic</span>
        <span className="text-gray-400">/</span>
        <InlineEditableTitle
          value={surveyTitle}
          onSave={onTitleSave}
          className="font-medium text-lg"
          placeholder="Untitled Survey"
        />
        {renderSaveStatus()}
        {onManualSave && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onManualSave}
            disabled={saveStatus === "saving"}
            className="h-8 w-8 p-0"
            title="Save now (Ctrl+S)"
          >
            <Save className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* CENTER - Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* RIGHT - Preview + Activate Toggle */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => navigate(`/surveys/${surveyId}/preview`)}
          className="gap-2"
        >
          <Eye className="w-4 h-4" />
          Preview
        </Button>

        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            onCheckedChange={onActivateToggle}
            id="survey-status-toggle"
          />
          <label
            htmlFor="survey-status-toggle"
            className={`text-sm font-medium cursor-pointer transition-colors ${
              isActive ? "text-green-600" : "text-gray-500"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </label>
        </div>
      </div>
    </header>
  );
}
