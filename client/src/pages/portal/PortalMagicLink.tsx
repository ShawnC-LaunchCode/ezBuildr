import { Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";

import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export default function PortalMagicLink() {
    const [location, setLocation] = useLocation();
    const [verifying, setVerifying] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const verifyToken = async () => {
            // Extract token from URL search params
            const searchParams = new URLSearchParams(window.location.search);
            const token = searchParams.get("token");

            if (!token) {
                toast({
                    title: "Invalid Link",
                    description: "No token provided in the link.",
                    variant: "destructive",
                });
                setLocation("/portal/login");
                return;
            }

            try {
                await api.post("/portal/auth/verify", { token });
                toast({
                    title: "Welcome back!",
                    description: "You have successfully signed in.",
                });
                setLocation("/portal");
            } catch (error) {
                toast({
                    title: "Sign In Failed",
                    description: "The link may be expired or invalid. Please try again.",
                    variant: "destructive",
                });
                setLocation("/portal/login");
            } finally {
                setVerifying(false); // Probably redirects before this, but good for cleanup
            }
        };

        verifyToken();
    }, [setLocation, toast]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
                <h2 className="text-xl font-semibold">Verifying your link...</h2>
            </div>
        </div>
    );
}
