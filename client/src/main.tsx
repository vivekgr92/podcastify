import { StrictMode, useState, useEffect } from "react";
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
import AudioPlayer from "./components/AudioPlayer";
import Sidebar from "./components/Sidebar";
import { Button } from "@/components/ui/button";


function Router() {
  const { user, isLoading } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen relative">
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
        <div className="flex-1">
          <div className="flex flex-col min-h-screen pb-24">
            <div className="flex-1">
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
                    <HomePage />
                  )}
                </Route>
                <Route path="/">
                  <HomePage />
                </Route>
                <Route>404 Page Not Found</Route>
              </Switch>
            </div>
          </div>
          <AudioPlayer />
        </div>
      </div>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>
);