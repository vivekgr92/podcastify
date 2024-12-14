import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route } from "wouter";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ConversionProvider } from "./context/ConversionContext";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import LibraryPage from "./pages/LibraryPage";
import PricingPage from "./pages/PricingPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import BillingPage from "./pages/BillingPage";
import { Loader2 } from "lucide-react";
import { useUser } from "./hooks/use-user";
import AudioPlayer from "./components/AudioPlayer";
import Sidebar from "./components/Sidebar";


function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen">
        {user && <Sidebar />}
        <div className="flex-1">
          <div className="flex flex-col min-h-screen pb-24">
            <div className="flex-1">
              <Switch>
                <Route path="/">
                  <HomePage />
                </Route>
                <Route path="/auth">
                  {user ? <HomePage /> : <AuthPage type="login" />}
                </Route>
                <Route path="/auth/signup">
                  {user ? <HomePage /> : <AuthPage type="signup" />}
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
                  {!user?.isAdmin ? <HomePage /> : <AdminPage />}
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
      <ConversionProvider>
        <Router />
        <Toaster />
      </ConversionProvider>
    </QueryClientProvider>
  </StrictMode>
);