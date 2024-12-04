import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Home,
  Library,
  Search,
  PlusCircle,
  LogOut,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useUser } from "../hooks/use-user";
import { useQuery } from "@tanstack/react-query";
import type { Playlist } from "@db/schema";

export default function Sidebar() {
  const [location] = useLocation();
  const { logout } = useUser();
  
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
            variant="ghost"
            className="w-full justify-start gap-2"
            asChild
          >
            <Link href="/search">
              <Search size={20} />
              Search
            </Link>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            asChild
          >
            <Link href="/library">
              <Library size={20} />
              Your Library
            </Link>
          </Button>
        </nav>
      </div>

      <ScrollArea className="flex-1 border-t px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Playlists</h2>
          <Button variant="ghost" size="icon">
            <PlusCircle size={20} />
          </Button>
        </div>

        <div className="space-y-1">
          {playlists?.map((playlist) => (
            <Button
              key={playlist.id}
              variant="ghost"
              className="w-full justify-start"
            >
              {playlist.title}
            </Button>
          ))}
        </div>
      </ScrollArea>

      <div className="p-6 border-t">
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
