import { Mail } from "lucide-react";
import React, { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export default function PortalLogin() {
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {return;}

        setLoading(true);
        try {
            await api.post("/portal/auth/send", { email });
            setSubmitted(true);
            toast({
                title: "Magic Link Sent",
                description: "Check your email for a link to sign in.",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to send magic link. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <div className="mx-auto bg-green-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                            <Mail className="h-6 w-6 text-green-600" />
                        </div>
                        <CardTitle>Check your email</CardTitle>
                        <CardDescription>
                            We've sent a magic link to <strong>{email}</strong>.
                            <br />
                            Click the link to sign in.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-4">
                            Use a different email
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Client Portal</CardTitle>
                    <CardDescription>
                        Enter your email to access your completed workflows and documents.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "Sending..." : "Send Magic Link"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
