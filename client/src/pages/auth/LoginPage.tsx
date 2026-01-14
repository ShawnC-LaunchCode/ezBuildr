import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Shield, Smartphone } from "lucide-react";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";

import logo from "@/assets/images/logo.png";
import { GoogleLogin } from "@/components/GoogleLogin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { authAPI } from "@/lib/vault-api";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // MFA State
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaUserId, setMfaUserId] = useState<string>("");
    const [mfaToken, setMfaToken] = useState("");

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const handleSuccess = async (response: any) => {
        if (response.token) {
            const { setAccessToken } = await import("@/lib/vault-api");
            const { queryClient } = await import("@/lib/queryClient");

            setAccessToken(response.token);
            queryClient.setQueryData(["auth"], {
                user: response.user,
                token: response.token
            });
        }
        window.location.href = "/dashboard";
    };

    const onSubmit = async (data: LoginFormValues) => {
        setIsLoading(true);
        try {
            const response = await authAPI.login(data);

            // Check for MFA requirement
            if ((response as any).requiresMfa) {
                setMfaRequired(true);
                setMfaUserId((response as any).userId);
                toast({
                    title: "Two-Factor Authentication Required",
                    description: "Please enter the code from your authenticator app.",
                });
                return;
            }

            await handleSuccess(response);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Login failed",
                description: error instanceof Error ? error.message : "Invalid credentials",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mfaToken) {return;}

        setIsLoading(true);
        try {
            const response = await authAPI.verifyMfaLogin(mfaUserId, mfaToken);
            await handleSuccess(response);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Authentication failed",
                description: "Invalid MFA code. Please try again.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (mfaRequired) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    <div className="flex flex-col items-center">
                        <img
                            src={logo}
                            alt="ezBuildr Logo"
                            className="w-12 h-12 rounded-xl shadow-lg object-cover mb-4"
                        />
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            Two-Factor Authentication
                        </h2>
                    </div>

                    <Card className="mt-8 shadow-xl border-dashed border-gray-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-indigo-600" />
                                Verify your identity
                            </CardTitle>
                            <CardDescription>
                                Enter the 6-digit code from your authenticator app.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleMfaSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <FormLabel>Authentication Code</FormLabel>
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                        <Input
                                            value={mfaToken}
                                            onChange={(e) => setMfaToken(e.target.value)}
                                            className="pl-10 text-lg tracking-widest"
                                            placeholder="000 000"
                                            maxLength={6}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <Button type="submit" className="w-full" disabled={isLoading || mfaToken.length < 6}>
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Verifying...
                                        </>
                                    ) : (
                                        "Verify"
                                    )}
                                </Button>

                                <button
                                    type="button"
                                    onClick={() => setMfaRequired(false)}
                                    className="w-full text-sm text-gray-500 hover:text-gray-900"
                                >
                                    Back to login
                                </button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div className="flex flex-col items-center">
                    <img
                        src={logo}
                        alt="ezBuildr Logo"
                        className="w-12 h-12 rounded-xl shadow-lg object-cover mb-4"
                    />
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Sign in to your account
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Or{" "}
                        <Link href="/auth/register" className="font-medium text-indigo-600 hover:text-indigo-500">
                            create a new account
                        </Link>
                    </p>
                </div>

                <Card className="mt-8 shadow-xl border-dashed border-gray-200">
                    <CardHeader>
                        <CardTitle>Welcome back</CardTitle>
                        <CardDescription>Enter your credentials to access your account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-center w-full">
                            <GoogleLogin onSuccess={() => window.location.href = "/dashboard"} />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-muted-foreground">Or continue with email</span>
                            </div>
                        </div>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input type="email" placeholder="name@example.com" autoComplete="email" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex items-center justify-end">
                                    <Link href="/auth/forgot-password" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                        Forgot password?
                                    </Link>
                                </div>

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : (
                                        "Sign in"
                                    )}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
