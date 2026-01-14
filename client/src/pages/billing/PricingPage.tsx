
import { Check } from "lucide-react";
import React from 'react';

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
        current: true // Mock current
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
        <div className="p-12 max-w-7xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">Plans & Pricing</h1>
            <p className="text-muted-foreground mb-12">Choose the plan that fits your needs.</p>

            <div className="grid md:grid-cols-3 gap-8">
                {PLANS.map((plan) => (
                    <Card key={plan.name} className={plan.current ? "border-primary border-2 shadow-lg" : ""}>
                        <CardHeader>
                            <CardTitle>{plan.name}</CardTitle>
                            <CardDescription>
                                <span className="text-3xl font-bold text-foreground">{plan.price}</span> / month
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-left">
                            {plan.features.map((f, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-500" />
                                    <span>{f}</span>
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
    );
}
