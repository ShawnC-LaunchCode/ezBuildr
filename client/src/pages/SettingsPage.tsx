import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAccountPreferences, useUpdateAccountPreferences } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings, Sparkles, Moon, Sun, Lightbulb, RotateCcw, Layers } from "lucide-react";
import type { Mode } from "@/lib/mode";

export default function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { prefs, isLoading, update, reset, isUpdating } = useUserPreferences();
  const { data: accountPrefs, isLoading: accountPrefsLoading } = useAccountPreferences();
  const updateAccountPrefsMutation = useUpdateAccountPreferences();
  const { toast } = useToast();
  const [localMode, setLocalMode] = useState<Mode>('easy');

  // Sync local mode state with fetched account preferences
  useEffect(() => {
    if (accountPrefs) {
      setLocalMode(accountPrefs.defaultMode);
    }
  }, [accountPrefs]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to access settings.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const handleToggle = (key: string, value: boolean) => {
    update({ [key]: value });
    toast({
      title: "Preference updated",
      description: `${formatLabel(key)} ${value ? "enabled" : "disabled"}.`,
    });
  };

  const handleDarkModeChange = (value: string) => {
    update({ darkMode: value as "system" | "light" | "dark" });
    toast({
      title: "Theme updated",
      description: `Theme set to ${value}.`,
    });
  };

  const handleReset = () => {
    reset();
    // Reset mode to easy
    updateAccountPrefsMutation.mutate({ defaultMode: 'easy' }, {
      onSuccess: () => {
        setLocalMode('easy');
      },
    });
    toast({
      title: "Preferences reset",
      description: "All preferences have been reset to defaults.",
    });
  };

  const handleModeChange = (mode: Mode) => {
    setLocalMode(mode);
    updateAccountPrefsMutation.mutate({ defaultMode: mode }, {
      onSuccess: () => {
        toast({
          title: "Mode updated",
          description: `Default mode set to ${mode === 'easy' ? 'Easy' : 'Advanced'}.`,
        });
      },
      onError: () => {
        // Revert on error
        setLocalMode(accountPrefs?.defaultMode || 'easy');
        toast({
          title: "Error",
          description: "Failed to update mode. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const formatLabel = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  if (authLoading || isLoading || accountPrefsLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header title="Settings" />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Settings" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <Settings className="w-8 h-8" />
                  User Preferences
                </h1>
                <p className="text-gray-600 mt-1">
                  Customize your Vault-Logic experience
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isUpdating}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to Defaults
              </Button>
            </div>

            {/* Workflow Mode Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Workflow Mode
                </CardTitle>
                <CardDescription>
                  Control the complexity level for workflow building
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Default Mode */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <Label htmlFor="defaultMode" className="text-base font-medium">
                      Default Mode
                    </Label>
                    <p className="text-sm text-gray-500">
                      Choose your default builder experience. Easy mode shows a curated set of features, while Advanced mode exposes all capabilities including raw JSON editing and transform blocks.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={localMode === 'easy' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleModeChange('easy')}
                      disabled={updateAccountPrefsMutation.isPending}
                    >
                      Easy
                    </Button>
                    <Button
                      variant={localMode === 'advanced' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleModeChange('advanced')}
                      disabled={updateAccountPrefsMutation.isPending}
                    >
                      Advanced
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  <strong>Note:</strong> You can override this setting for individual workflows in the Workflow Builder.
                </div>
              </CardContent>
            </Card>

            {/* Appearance Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="w-5 h-5" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize the look and feel of the application
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Dark Mode */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="darkMode" className="text-base font-medium">
                      Theme
                    </Label>
                    <p className="text-sm text-gray-500">
                      Choose your preferred color scheme
                    </p>
                  </div>
                  <select
                    id="darkMode"
                    className="border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={prefs.darkMode ?? "system"}
                    onChange={(e) => handleDarkModeChange(e.target.value)}
                    disabled={isUpdating}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Celebration & Effects */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Celebrations & Effects
                </CardTitle>
                <CardDescription>
                  Control visual celebration effects throughout the app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Celebration Effects */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="celebration" className="text-base font-medium">
                      Celebration Effects
                    </Label>
                    <p className="text-sm text-gray-500">
                      Show confetti and animations on achievements
                    </p>
                  </div>
                  <Switch
                    id="celebration"
                    checked={prefs.celebrationEffects ?? true}
                    onCheckedChange={(v) => handleToggle("celebrationEffects", v)}
                    disabled={isUpdating}
                  />
                </div>
              </CardContent>
            </Card>

            {/* AI Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" />
                  AI Features
                </CardTitle>
                <CardDescription>
                  Manage AI-powered features and suggestions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AI Hints */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="aiHints" className="text-base font-medium">
                      AI Hints & Suggestions
                    </Label>
                    <p className="text-sm text-gray-500">
                      Receive intelligent suggestions while building surveys
                    </p>
                  </div>
                  <Switch
                    id="aiHints"
                    checked={prefs.aiHints ?? true}
                    onCheckedChange={(v) => handleToggle("aiHints", v)}
                    disabled={isUpdating}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Info Footer */}
            <div className="text-center text-sm text-gray-500 py-4">
              Your preferences are automatically saved and synced across sessions.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
