import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import LibraryPage from "./pages/LibraryPage";
import PricingPage from "./pages/PricingPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import BillingPage from "./pages/BillingPage";
import { Loader2, Menu } from "lucide-react";
import { useUser } from "./hooks/use-user";
import Sidebar from "./components/Sidebar";
import { Button } from "@/components/ui/button";
import { FC, useState } from "react";
import ForgotPasswordPage from "./pages/ForgotPasswordPage"; // Added import


// Extract AppRouter into its own component to properly use hooks
const AppRouter: FC = () => {
  const { user, isLoading } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <div className="flex flex-1">
        {user && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden fixed top-4 left-4 z-50"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </Button>
            <div
              className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
                isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
              } md:hidden z-40`}
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <Sidebar
              isMobileMenuOpen={isMobileMenuOpen}
              setIsMobileMenuOpen={setIsMobileMenuOpen}
            />
          </>
        )}
        <div className="flex-1 overflow-auto">
          <Switch>
            <Route path="/auth">
              {user ? <HomePage /> : <AuthPage />}
            </Route>
            <Route path="/auth/signup">
              {user ? <HomePage /> : <AuthPage />}
            </Route>
            <Route path="/library">
              {!user ? <AuthPage /> : <LibraryPage />}
            </Route>
            <Route path="/pricing">
              <PricingPage />
            </Route>
            <Route path="/profile">
              {!user ? <AuthPage /> : <ProfilePage />}
            </Route>
            <Route path="/billing">
              {!user ? <AuthPage /> : <BillingPage />}
            </Route>
            <Route path="/admin">
              {!user ? (
                <AuthPage />
              ) : user.isAdmin ? (
                <AdminPage />
              ) : (
                <div className="min-h-screen bg-black text-white p-6">
                  <div className="max-w-md mx-auto text-center">
                    <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
                    <p className="mb-4">You need administrator privileges to access this page.</p>
                    <p className="text-sm text-gray-400">Please use an account with an @admin.com email address to access this page.</p>
                  </div>
                </div>
              )}
            </Route>
            <Route path="/forgot-password">
              <ForgotPasswordPage /> {/* Added forgot password route */}
            </Route>
            <Route path="/">
              <HomePage />
            </Route>
            <Route>404 Page Not Found</Route>
          </Switch>
        </div>
      </div>
      <Toaster />
    </div>
  );
};

// Main app render
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>
);