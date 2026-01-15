import { Settings, Sparkles, Moon, Sun, Lightbulb, RotateCcw, Layers, Shield, Smartphone, QrCode, Lock } from "lucide-react";
import React, { useEffect, useState } from "react";


import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import type { Mode } from "@/lib/mode";
import { authAPI } from "@/lib/vault-api";
import { useAccountPreferences, useUpdateAccountPreferences } from "@/lib/vault-hooks";

export default function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { prefs, isLoading, update, reset, isUpdating } = useUserPreferences();
  const { data: accountPrefs, isLoading: accountPrefsLoading } = useAccountPreferences();
  const updateAccountPrefsMutation = useUpdateAccountPreferences();
  const { toast } = useToast();
  const [localMode, setLocalMode] = useState<Mode>('easy');

  // MFA State
  const [mfaStatus, setMfaStatus] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupStep, setSetupStep] = useState<'qr' | 'success'>('qr');
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  // Sync local mode state with fetched account preferences
  useEffect(() => {
    if (accountPrefs) {
      setLocalMode(accountPrefs.defaultMode);
    }
  }, [accountPrefs]);

  // Fetch MFA Status
  useEffect(() => {
    if (isAuthenticated) {
      authAPI.getMfaStatus()
        .then(res => setMfaStatus({ enabled: res.mfaEnabled, backupCodesRemaining: res.backupCodesRemaining }))
        .catch(console.error);
    }
  }, [isAuthenticated]);

  const startMfaSetup = async () => {
    try {
      const res = await authAPI.setupMfa();
      setQrCodeUrl(res.qrCodeDataUrl);
      setBackupCodes(res.backupCodes);
      setSetupStep('qr');
      setIsSetupOpen(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: "Could not initiate MFA setup."
      });
    }
  };

  const finishMfaSetup = async () => {
    try {
      await authAPI.verifyMfa(verifyCode);
      setSetupStep('success');
      setMfaStatus({ enabled: true, backupCodesRemaining: 10 });
      toast({
        title: "MFA Enabled",
        description: "Two-factor authentication is now active."
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: "Invalid code. Please try again."
      });
    }
  };

  const handleDisableMfa = async () => {
    try {
      await authAPI.disableMfa(disablePassword);
      setMfaStatus({ enabled: false, backupCodesRemaining: 0 });
      setIsDisableOpen(false);
      setDisablePassword("");
      toast({
        title: "MFA Disabled",
        description: "Two-factor authentication has been turned off."
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Disable Failed",
        description: "Incorrect password or error disabling MFA."
      });
    }
  };

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

            {/* Account Security (MFA) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Account Security
                </CardTitle>
                <CardDescription>
                  Manage your account security and two-factor authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1">
                    <Label className="text-base font-medium">Two-Factor Authentication (2FA)</Label>
                    <p className="text-sm text-gray-500">
                      {mfaStatus?.enabled
                        ? "Your account is secured with 2FA."
                        : "Add an extra layer of security to your account."}
                    </p>
                  </div>
                  {mfaStatus?.enabled ? (
                    <Button variant="destructive" onClick={() => setIsDisableOpen(true)}>Disable 2FA</Button>
                  ) : (
                    <Button onClick={startMfaSetup}>Enable 2FA</Button>
                  )}
                </div>
              </CardContent>
            </Card>

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

        {/* MFA Setup Dialog */}
        <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{setupStep === 'qr' ? 'Setup Two-Factor Authentication' : 'MFA Enabled Successfully'}</DialogTitle>
              <DialogDescription>
                {setupStep === 'qr'
                  ? "Scan the QR code with your authenticator app (Authy, Google Authenticator, etc.) to get started."
                  : "Your backup codes are below. Store them in a safe place."}
              </DialogDescription>
            </DialogHeader>

            {setupStep === 'qr' ? (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  {qrCodeUrl && <img src={qrCodeUrl} alt="MFA QR Code" className="w-48 h-48" />}
                </div>
                <div className="space-y-2">
                  <Label>Verification Code</Label>
                  <Input
                    placeholder="000 000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    maxLength={6}
                  />
                  <Button className="w-full" onClick={finishMfaSetup}>Verify & Activate</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-md text-sm font-mono grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <div key={i}>{code}</div>
                  ))}
                </div>
                <p className="text-sm text-red-500">
                  Warning: If you lose access to your device, these codes are the only way to recover your account.
                </p>
                <DialogFooter>
                  <Button onClick={() => setIsSetupOpen(false)}>Done</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* MFA Disable Dialog */}
        <Dialog open={isDisableOpen} onOpenChange={setIsDisableOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disable 2FA</DialogTitle>
              <DialogDescription>
                Please enter your password to confirm disabling Two-Factor Authentication.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                type="password"
                placeholder="Current Password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDisableOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDisableMfa}>Disable 2FA</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
