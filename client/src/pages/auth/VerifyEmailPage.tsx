import { Loader2, CheckCircle, XCircle } from "lucide-react";
import React, { useState, useEffect } from "react";
import { Link } from "wouter";

import logo from "@/assets/images/logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authAPI } from "@/lib/vault-api";

export default function VerifyEmailPage() {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState("");

    useEffect(() => {
        const fn = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (!token) {
                setStatus('error');
                setMessage("Missing verification token.");
                return;
            }

            try {
                await authAPI.verifyEmail(token);
                setStatus('success');
            } catch (error) {
                setStatus('error');
                setMessage("Invalid or expired verification token.");
            }
        };
        fn();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div className="flex flex-col items-center">
                    <img
                        src={logo}
                        alt="ezBuildr Logo"
                        className="w-12 h-12 rounded-xl shadow-lg object-cover mb-4"
                    />
                </div>

                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center">Email Verification</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                        {status === 'loading' && (
                            <>
                                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                                <p>Verifying your email...</p>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <CheckCircle className="h-12 w-12 text-green-500" />
                                <p className="text-lg font-medium text-green-700">Email Verified!</p>
                                <p className="text-center text-gray-500">Your account has been successfully verified.</p>
                                <Button asChild className="w-full mt-4">
                                    <Link href="/auth/login">Continue to Sign In</Link>
                                </Button>
                            </>
                        )}

                        {status === 'error' && (
                            <>
                                <XCircle className="h-12 w-12 text-red-500" />
                                <p className="text-lg font-medium text-red-700">Verification Failed</p>
                                <p className="text-center text-gray-500">{message}</p>
                                <Button asChild variant="outline" className="w-full mt-4">
                                    <Link href="/auth/login">Return to Sign In</Link>
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
