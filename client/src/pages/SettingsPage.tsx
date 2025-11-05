import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings, Sparkles, Moon, Sun, Lightbulb, RotateCcw } from "lucide-react";

export default function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { prefs, isLoading, update, reset, isUpdating } = useUserPreferences();
  const { toast } = useToast();

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
    toast({
      title: "Preferences reset",
      description: "All preferences have been reset to defaults.",
    });
  };

  const formatLabel = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  if (authLoading || isLoading) {
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
