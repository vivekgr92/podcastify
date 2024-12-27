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
import { Loader2 } from "lucide-react";

type LoginCredentials = {
  username: string;
  password: string;
};

export default function AuthPage() {
  const { login, register } = useUser();
  const [, setLocation] = useLocation();
  const [isLogin, setIsLogin] = useState(window.location.pathname !== "/auth/signup");
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      displayName: "",
    },
    mode: "onBlur",
  });

  async function onSubmit(values: InsertUser) {
    try {
      setIsLoading(true);
      console.log("[Debug] Form submission started");
      console.log("[Debug] Form values:", values);
      console.log("[Debug] Is login mode:", isLogin);

      if (isLogin) {
        // For login, only send username and password
        const loginCredentials: LoginCredentials = {
          username: values.username,
          password: values.password,
        };
        const result = await login(loginCredentials);
        if (result.ok) {
          toast({
            title: "Success",
            description: "Logged in successfully"
          });
          setLocation("/library");
        } else {
          toast({
            title: "Error",
            description: result.message || "Login failed",
            variant: "destructive"
          });
        }
      } else {
        // For registration, send all user data
        const result = await register(values);
        if (result.ok) {
          toast({
            title: "Success",
            description: "Account created successfully"
          });
          setLocation("/library");
        } else {
          toast({
            title: "Error",
            description: result.message || "Registration failed",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          'url("https://images.unsplash.com/photo-1532342342267-77e8db262ebc")',
      }}
    >
      <div className="w-full max-w-md p-8 space-y-6 bg-background/95 backdrop-blur-sm rounded-lg shadow-xl">
        <h1 className="text-3xl font-bold text-center">
          {isLogin ? "Welcome Back" : "Create Account"}
        </h1>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="space-y-4"
          >
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
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="email@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLogin ? (
                "Sign In"
              ) : (
                "Sign Up"
              )}
            </Button>
          </form>
        </Form>

        <div className="text-center">
          <Button
            variant="link"
            onClick={() => {
              setIsLogin(!isLogin);
              setLocation(isLogin ? "/auth/signup" : "/auth");
            }}
            className="text-primary"
            disabled={isLoading}
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