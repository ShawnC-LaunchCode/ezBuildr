import { Loader2, Zap, FileText, Upload } from "lucide-react";
import { useEffect, useState } from 'react';
import { Link } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    workflow_run?: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    document_generated?: number;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    storage_bytes?: number;
}

interface Limits {
    runs: number;
    documents: number;
    // eslint-disable-next-line complexity
    // eslint-disable-next-line @typescript-eslint/naming-convention
    storage_mb: number;
}

// eslint-disable-next-line complexity
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
            if (!res.ok) { throw new Error("Failed to load billing data"); }
            const data = await res.json() as { subscription: Subscription; usage: Usage; limits: Limits };
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
            const data = await res.json() as { url?: string };
            if (data.url) {
                window.location.href = data.url;
            }
        } catch {
            toast({ title: "Error", description: "Failed to redirect to billing portal." });
        }
    };

    const getUsagePercent = (used: number = 0, limit: number) => {
        if (limit === -1) { return 0; } // Unlimited
        return Math.min(100, (used / limit) * 100);
    };

    const isUnlimited = (val: number) => val === -1;
    const headerActions = (
        <div className="flex items-center gap-2">
            <Link href="/billing/plans">
                <Button variant="outline">Plans</Button>
            </Link>
            <Button onClick={() => { void handleManageSubscription(); }} disabled={loading}>
                Manage Subscription
            </Button>
        </div>
    );

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header
                    title="Billing & Usage"
                    description="Manage your plan and monitor usage limits"
                    actions={headerActions}
                />
                <div className="flex-1 overflow-auto p-4 sm:p-6">
                    {loading ? (
                        <div className="flex min-h-64 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                        </div>
                    ) : (
                        <div className="space-y-6">
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
                                        Renews on {new Date(sub?.currentPeriodEnd ?? Date.now()).toLocaleDateString()}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex gap-4">
                                        <div className="text-2xl font-bold">
                                            ${((sub?.plan.priceMonthly ?? 0) / 100).toFixed(2)}
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
                                            <Zap className="w-4 h-4" aria-hidden="true" /> Workflow Runs
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold mb-2">
                                            {usage.workflow_run ?? 0}
                                            <span className="text-sm font-normal text-muted-foreground">
                                                {isUnlimited(limits?.runs ?? 0) ? " / Unlimited" : ` / ${limits?.runs}`}
                                            </span>
                                        </div>
                                        {!isUnlimited(limits?.runs ?? 0) && (
                                            <Progress value={getUsagePercent(usage.workflow_run, limits?.runs ?? 1)} />
                                        )}
                                    </CardContent>
                                </Card>
                                {/* Documents Generated */}
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <FileText className="w-4 h-4" aria-hidden="true" /> Documents
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold mb-2">
                                            {usage.document_generated ?? 0}
                                            <span className="text-sm font-normal text-muted-foreground">
                                                {isUnlimited(limits?.documents ?? 0) ? " / Unlimited" : ` / ${limits?.documents}`}
                                            </span>
                                        </div>
                                        {!isUnlimited(limits?.documents ?? 0) && (
                                            <Progress value={getUsagePercent(usage.document_generated, limits?.documents ?? 1)} />
                                        )}
                                    </CardContent>
                                </Card>
                                {/* Storage */}
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <Upload className="w-4 h-4" aria-hidden="true" /> Storage
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold mb-2">
                                            {((usage.storage_bytes ?? 0) / 1024 / 1024).toFixed(0)} MB
                                            <span className="text-sm font-normal text-muted-foreground">
                                                {isUnlimited(limits?.storage_mb ?? 0) ? " / Unlimited" : ` / ${limits?.storage_mb} MB`}
                                            </span>
                                        </div>
                                        {!isUnlimited(limits?.storage_mb ?? 0) && (
                                            <Progress value={getUsagePercent((usage.storage_bytes ?? 0) / 1024 / 1024, limits?.storage_mb ?? 1)} />
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
