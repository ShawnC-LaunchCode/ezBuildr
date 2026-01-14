import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft } from "lucide-react";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { z } from "zod";

import logo from "@/assets/images/logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { authAPI } from "@/lib/vault-api";

const forgotPasswordSchema = z.object({
    email: z.string().email("Please enter a valid email"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const form = useForm<ForgotPasswordFormValues>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: "",
        },
    });

    const onSubmit = async (data: ForgotPasswordFormValues) => {
        setIsLoading(true);
        try {
            await authAPI.forgotPassword(data.email);
            // We always show success to prevent enumeration
            setIsSubmitted(true);
            toast({
                title: "Email sent",
                description: "If an account exists, a reset link has been sent.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Request failed",
                description: "Something went wrong. Please try again.",
            });
        } finally {
            setIsLoading(false);
        }
    };

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
                        Reset your password
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Enter your email to receive reset instructions
                    </p>
                </div>

                <Card className="mt-8 shadow-xl border-dashed border-gray-200">
                    <CardHeader>
                        <CardTitle>Forgot Password</CardTitle>
                        <CardDescription>
                            {isSubmitted
                                ? "Check your email for the reset link."
                                : "Enter your email address to reset your password."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isSubmitted ? (
                            <div className="text-center space-y-4">
                                <div className="bg-green-50 text-green-700 p-4 rounded-md text-sm">
                                    If an account exists with that email, we've sent instructions to reset your password.
                                </div>
                                <Button variant="outline" className="w-full" onClick={() => setIsSubmitted(false)}>
                                    Try another email
                                </Button>
                            </div>
                        ) : (
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="name@example.com" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <Button type="submit" className="w-full" disabled={isLoading}>
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Sending link...
                                            </>
                                        ) : (
                                            "Send Reset Link"
                                        )}
                                    </Button>
                                </form>
                            </Form>
                        )}
                        <div className="flex justify-center mt-4">
                            <Link href="/auth/login" className="flex items-center text-sm text-gray-600 hover:text-gray-900">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Sign in
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
