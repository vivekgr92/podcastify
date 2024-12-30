import { useUser } from "../hooks/use-user";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const { login, register } = useUser();
  const [location, setLocation] = useLocation();
  const [isLogin, setIsLogin] = useState(!location.includes("signup"));
  const { toast } = useToast();

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      displayName: "",
    },
    mode: "onChange"
  });

  async function onSubmit(data: InsertUser) {
    try {
      const result = await (isLogin ? login(data) : register(data));
      if (!result.ok) {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: isLogin ? "Logged in successfully" : "Account created successfully",
        });
        // Use setLocation for client-side routing
        setLocation("/library");
      }
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1532342342267-77e8db262ebc")' }}
    >
      <div className="w-full max-w-md p-8 space-y-6 bg-background/95 backdrop-blur-sm rounded-lg shadow-xl">
        <h1 className="text-3xl font-bold text-center">
          {isLogin ? "Welcome Back" : "Create Account"}
        </h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isLogin && (
              <>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
              </>
            )}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">
              {isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>
        </Form>

        {isLogin && (
          <Button
            variant="link"
            onClick={async () => {
              const email = form.getValues("email");
              if (!email) {
                toast({
                  title: "Error",
                  description: "Please enter your email first",
                  variant: "destructive",
                });
                return;
              }

              try {
                const response = await fetch("/api/reset-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });

                const data = await response.json();
                
                if (!response.ok) {
                  throw new Error(data.error);
                }

                toast({
                  title: "Success",
                  description: `Your temporary password is: ${data.temporaryPassword}`,
                });
              } catch (error) {
                toast({
                  title: "Error",
                  description: error instanceof Error ? error.message : "Failed to reset password",
                  variant: "destructive",
                });
              }
            }}
            className="text-primary"
          >
            Forgot Password?
          </Button>
        )}

        <div className="text-center">
          <Button
            variant="link"
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary"
          >
            {isLogin
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
