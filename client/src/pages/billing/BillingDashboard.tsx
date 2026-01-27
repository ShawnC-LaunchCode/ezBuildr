import { Loader2, Zap, FileText, Upload } from "lucide-react";
import React, { useEffect, useState } from 'react';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
interface Subscription {
    status: string;
    plan: {
        name: string;
        priceMonthly: number;
    };
    currentPeriodEnd: string;
}
interface Usage {
    workflow_run?: number;
    document_generated?: number;
    storage_bytes?: number;
}
interface Limits {
    runs: number;
    documents: number;
    storage_mb: number;
}
export default function BillingDashboard() {
    const [loading, setLoading] = useState(true);
    const [sub, setSub] = useState<Subscription | null>(null);
    const [usage, setUsage] = useState<Usage>({});
    const [limits, setLimits] = useState<Limits | null>(null);
    const { toast } = useToast();
    useEffect(() => { void fetchBillingData(); }, []);
    const fetchBillingData = async () => {
        try {
            const res = await fetch('/api/billing/subscription');
            if (!res.ok) {throw new Error("Failed to load billing data");}
            const data = await res.json();
            setSub(data.subscription);
            setUsage(data.usage);
            setLimits(data.limits);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Could not load billing information.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };
    const handleManageSubscription = async () => {
        try {
            const res = await fetch('/api/billing/portal', { method: 'POST' });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to redirect to billing portal." });
        }
    };
    if (loading) {return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;}
    const getUsagePercent = (used: number = 0, limit: number) => {
        if (limit === -1) {return 0;} // Unlimited
        return Math.min(100, (used / limit) * 100);
    };
    const isUnlimited = (val: number) => val === -1;
    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Billing & Usage</h1>
                    <p className="text-muted-foreground mt-2">Manage your plan and monitor usage limits.</p>
                </div>
                <Button onClick={() => { void handleManageSubscription(); }}>Manage Subscription</Button>
            </div>
            {/* Current Plan Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Current Plan: {sub?.plan.name}
                        <Badge variant={sub?.status === 'active' ? "default" : "destructive"}>
                            {sub?.status}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        Renews on {new Date(sub?.currentPeriodEnd || Date.now()).toLocaleDateString()}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <div className="text-2xl font-bold">
                            ${((sub?.plan.priceMonthly || 0) / 100).toFixed(2)}
                            <span className="text-sm font-normal text-muted-foreground"> / month</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
            {/* Usage Metrics */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Workflow Runs */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Zap className="w-4 h-4" /> Workflow Runs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold mb-2">
                            {usage.workflow_run || 0}
                            <span className="text-sm font-normal text-muted-foreground">
                                {isUnlimited(limits?.runs || 0) ? " / Unlimited" : ` / ${limits?.runs}`}
                            </span>
                        </div>
                        {!isUnlimited(limits?.runs || 0) && (
                            <Progress value={getUsagePercent(usage.workflow_run, limits?.runs || 1)} />
                        )}
                    </CardContent>
                </Card>
                {/* Documents Generated */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Documents
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold mb-2">
                            {usage.document_generated || 0}
                            <span className="text-sm font-normal text-muted-foreground">
                                {isUnlimited(limits?.documents || 0) ? " / Unlimited" : ` / ${limits?.documents}`}
                            </span>
                        </div>
                        {!isUnlimited(limits?.documents || 0) && (
                            <Progress value={getUsagePercent(usage.document_generated, limits?.documents || 1)} />
                        )}
                    </CardContent>
                </Card>
                {/* Storage */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Upload className="w-4 h-4" /> Storage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold mb-2">
                            {((usage.storage_bytes || 0) / 1024 / 1024).toFixed(0)} MB
                            <span className="text-sm font-normal text-muted-foreground">
                                {isUnlimited(limits?.storage_mb || 0) ? " / Unlimited" : ` / ${limits?.storage_mb} MB`}
                            </span>
                        </div>
                        {!isUnlimited(limits?.storage_mb || 0) && (
                            <Progress value={getUsagePercent((usage.storage_bytes || 0) / 1024 / 1024, limits?.storage_mb || 1)} />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}