/**
 * Add Google Sheets Dialog
 * Guided onboarding flow for connecting Google Sheets
 */

import { FileSpreadsheet, Plus, CheckCircle } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface AddGoogleSheetsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

type Step = 'auth' | 'select-spreadsheet' | 'select-sheet' | 'name';

export function AddGoogleSheetsDialog({ open, onOpenChange, onComplete }: AddGoogleSheetsDialogProps) {
    const { toast } = useToast();
    const [step, setStep] = useState<Step>('auth');
    const [isConnecting, setIsConnecting] = useState(false);
    const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
    const [selectedSheet, setSelectedSheet] = useState('');
    const [connectionName, setConnectionName] = useState('');

    // Mock data for demo - would come from Google Sheets API
    const mockSpreadsheets = [
        { id: 'sheet1', name: 'Client Intake Responses' },
        { id: 'sheet2', name: 'Case Management Database' },
        { id: 'sheet3', name: 'Document Templates' },
    ];

    const mockSheets = [
        { id: 'tab1', name: 'Main Data' },
        { id: 'tab2', name: 'Archive' },
        { id: 'tab3', name: 'Reference' },
    ];

    const handleGoogleAuth = async () => {
        setIsConnecting(true);

        // Simulate OAuth flow
        await new Promise(resolve => setTimeout(resolve, 1000));

        setIsConnecting(false);
        setStep('select-spreadsheet');

        toast({
            title: "Connected to Google",
            description: "Select a spreadsheet to continue",
        });
    };

    const handleContinue = () => {
        if (step === 'select-spreadsheet' && selectedSpreadsheet) {
            setStep('select-sheet');
        } else if (step === 'select-sheet' && selectedSheet) {
            // Auto-generate name
            const spreadsheetName = mockSpreadsheets.find(s => s.id === selectedSpreadsheet)?.name || 'Google Sheets';
            setConnectionName(`${spreadsheetName} - Connection`);
            setStep('name');
        }
    };

    const handleComplete = async () => {
        setIsConnecting(true);

        try {
            // TODO: Call backend API to create data source
            await fetch('/api/data-sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    type: 'google_sheets',
                    name: connectionName,
                    metadata: {
                        spreadsheetId: selectedSpreadsheet,
                        sheetId: selectedSheet,
                    },
                }),
            });

            toast({
                title: "Google Sheets Connected",
                description: `${connectionName} is now available`,
            });

            onComplete?.();
            onOpenChange(false);

            // Reset state
            setStep('auth');
            setSelectedSpreadsheet('');
            setSelectedSheet('');
            setConnectionName('');
        } catch (error) {
            toast({
                title: "Connection Failed",
                description: error instanceof Error ? error.message : "Failed to connect",
                variant: "destructive",
            });
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-green-600" />
                        <DialogTitle>Connect Google Sheets</DialogTitle>
                    </div>
                    <DialogDescription>
                        {step === 'auth' && 'Connect your Google account to access spreadsheets'}
                        {step === 'select-spreadsheet' && 'Choose a spreadsheet to connect'}
                        {step === 'select-sheet' && 'Select which sheet tab to use'}
                        {step === 'name' && 'Name this connection'}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {/* Step 1: Google Auth */}
                    {step === 'auth' && (
                        <div className="text-center space-y-4">
                            <div className="p-8 bg-muted/50 rounded-lg">
                                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-green-600" />
                                <p className="text-sm text-muted-foreground">
                                    You'll be redirected to Google to authorize access to your spreadsheets.
                                </p>
                            </div>
                            <Button
                                onClick={handleGoogleAuth}
                                disabled={isConnecting}
                                className="w-full"
                            >
                                {isConnecting ? 'Connecting...' : 'Connect to Google'}
                            </Button>
                        </div>
                    )}

                    {/* Step 2: Select Spreadsheet */}
                    {step === 'select-spreadsheet' && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
                                <CheckCircle className="w-4 h-4" />
                                <span>Connected to Google</span>
                            </div>
                            <div className="space-y-2">
                                <Label>Spreadsheet</Label>
                                <Select value={selectedSpreadsheet} onValueChange={setSelectedSpreadsheet}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a spreadsheet" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mockSpreadsheets.map(sheet => (
                                            <SelectItem key={sheet.id} value={sheet.id}>
                                                {sheet.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Select Sheet Tab */}
                    {step === 'select-sheet' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Sheet Tab</Label>
                                <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a sheet tab" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {mockSheets.map(sheet => (
                                            <SelectItem key={sheet.id} value={sheet.id}>
                                                {sheet.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Name Connection */}
                    {step === 'name' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Connection Name</Label>
                                <Input
                                    value={connectionName}
                                    onChange={(e) => setConnectionName(e.target.value)}
                                    placeholder="e.g., Client Intake Data"
                                />
                                <p className="text-xs text-muted-foreground">
                                    This name will appear in your workflow blocks
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step !== 'auth' && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (step === 'select-spreadsheet') {setStep('auth');}
                                if (step === 'select-sheet') {setStep('select-spreadsheet');}
                                if (step === 'name') {setStep('select-sheet');}
                            }}
                        >
                            Back
                        </Button>
                    )}

                    {step === 'select-spreadsheet' && (
                        <Button
                            onClick={handleContinue}
                            disabled={!selectedSpreadsheet}
                        >
                            Continue
                        </Button>
                    )}

                    {step === 'select-sheet' && (
                        <Button
                            onClick={handleContinue}
                            disabled={!selectedSheet}
                        >
                            Continue
                        </Button>
                    )}

                    {step === 'name' && (
                        <Button
                            onClick={handleComplete}
                            disabled={!connectionName || isConnecting}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            {isConnecting ? 'Adding...' : 'Add Connection'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
