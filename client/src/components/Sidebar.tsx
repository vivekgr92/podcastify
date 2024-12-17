import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Home,
  Library,
  Search,
  PlusCircle,
  LogOut,
  User,
  CreditCard,
  Users,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { useUser } from "../hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import type { Playlist } from "@db/schema";

interface SidebarProps {
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (open: boolean) => void;
}

export default function Sidebar({ isMobileMenuOpen = false, setIsMobileMenuOpen }: SidebarProps) {
  const [location] = useLocation();
  const { logout, user } = useUser();
  
  const { data: userStats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: async () => {
      const res = await fetch("/api/user/stats");
      if (!res.ok) throw new Error("Failed to fetch user stats");
      return res.json();
    },
  });

  const { data: playlists } = useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: async () => {
      const res = await fetch("/api/playlists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return res.json();
    },
  });

  return (
    <div 
      className={`${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 fixed md:static top-0 left-0 w-64 h-[calc(100vh-6rem)] bg-background border-r flex flex-col transition-all duration-300 ease-in-out shadow-lg md:shadow-none z-40 pb-24`}
    >
      <div className="flex flex-col h-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMobileMenuOpen && setIsMobileMenuOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
          
          {user && (
            <div className="mb-6 flex flex-col gap-2">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{user.username}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <ScrollArea className="flex-1 px-6">
          <nav className="space-y-2">
            <Button
              variant={location === "/" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/">
                <Home size={20} />
                Home
              </Link>
            </Button>
            
            <Button
              variant={location === "/profile" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/profile">
                <User size={20} />
                Profile
              </Link>
            </Button>
            
            <Button
              variant={location === "/billing" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/billing">
                <CreditCard size={20} />
                Billing
                {userStats && (
                  <div className="ml-auto text-xs bg-muted px-2 py-1 rounded">
                    ${userStats.totalCost}
                  </div>
                )}
              </Link>
            </Button>
            
            {user?.isAdmin && (
              <Button
                variant={location === "/admin" ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                asChild
              >
                <Link href="/admin">
                  <Users size={20} />
                  Admin Dashboard
                </Link>
              </Button>
            )}
            
            <Button
              variant={location === "/library" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/library">
                <Library size={20} />
                Library
                {userStats && (
                  <div className="ml-auto text-xs bg-muted px-2 py-1 rounded">
                    {userStats.convertedArticles}
                  </div>
                )}
              </Link>
            </Button>
          </nav>
        </ScrollArea>

        <div className="p-6 border-t mt-auto">
          {userStats && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Articles</p>
                <p className="font-medium">{userStats.convertedArticles}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="font-medium">${userStats.totalCost}</p>
              </div>
            </div>
          )}
          <Button
            variant="destructive"
            className="w-full justify-start gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow-lg transition-all duration-200 ease-in-out hover:shadow-xl"
            onClick={() => logout()}
          >
            <LogOut size={20} />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
}
