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
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useUser } from "../hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import type { Playlist } from "@db/schema";

export default function Sidebar() {
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
    <div className="w-64 h-screen bg-background border-r flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold mb-6">PodcastApp</h1>
        
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
      </div>

      <div className="flex-1" />

      <div className="p-6 border-t space-y-2">
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
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => logout()}
        >
          <LogOut size={20} />
          Log Out
        </Button>
      </div>
    </div>
  );
}
