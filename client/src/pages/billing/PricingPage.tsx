import { Check } from "lucide-react";
import { Link } from "wouter";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

const PLANS = [
    {
        name: 'Free',
        price: '$0',
        features: ['2 Workflows', '50 Runs/mo', 'Basic Blocks', 'Community Support'],
        current: false
    },
    {
        name: 'Pro',
        price: '$29',
        features: ['10 Workflows', '1,000 Runs/mo', 'Scripting Engine', 'Doc Gen', 'Email Support'],
        current: true
    },
    {
        name: 'Team',
        price: '$99',
        features: ['Unlimited Workflows', '10k Runs/mo', 'Team Collaboration', 'Template Marketplace', 'Priority Support'],
        current: false
    }
];

export default function PricingPage() {
    return (
        <div className="flex h-screen bg-background overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header
                    title="Plans & Pricing"
                    description="Choose the plan that fits your needs"
                    actions={
                        <Link href="/billing">
                            <Button variant="outline">Billing</Button>
                        </Link>
                    }
                />
                <div className="flex-1 overflow-auto p-4 sm:p-6">
                    <div className="grid gap-6 md:grid-cols-3">
                        {PLANS.map((plan) => (
                            <Card key={plan.name} className={plan.current ? "border-primary shadow-md" : ""}>
                                <CardHeader>
                                    <CardTitle>{plan.name}</CardTitle>
                                    <CardDescription>
                                        <span className="text-3xl font-bold text-foreground">{plan.price}</span> / month
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {plan.features.map((feature) => (
                                        <div key={feature} className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-500" aria-hidden="true" />
                                            <span>{feature}</span>
                                        </div>
                                    ))}
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full" variant={plan.current ? "outline" : "default"} disabled={plan.current}>
                                        {plan.current ? "Current Plan" : "Upgrade"}
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
