import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";
import { Share2, Upload, Play } from "lucide-react";
import { useLocation } from "wouter";

export default function LibraryPage() {
  const [, setLocation] = useLocation();

  const { data: podcasts, isLoading } = useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: async () => {
      const res = await fetch("/api/podcasts");
      if (!res.ok) throw new Error("Failed to fetch podcasts");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="flex justify-between items-center p-6">
        <h1 className="text-xl font-bold text-[#4CAF50]">Podcastify</h1>
        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => setLocation('/')}>Home</Button>
          <Button variant="ghost">Library</Button>
          <Button variant="outline" onClick={() => setLocation('/auth/signup')}>Sign Up</Button>
          <Button onClick={() => setLocation('/auth')}>Login</Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Your Library</h1>
          <Button onClick={() => setLocation('/')} className="bg-[#4CAF50] hover:bg-[#45a049]">
            Convert New Podcast
          </Button>
        </div>

        <div className="space-y-4">
          {podcasts?.map((podcast) => (
            <div key={podcast.id} className="bg-gray-900 rounded-lg p-4">
              <div className="flex flex-col">
                <div className="mb-4">
                  <h3 className="text-lg font-medium mb-2">{podcast.title}</h3>
                  <p className="text-sm text-gray-400">{podcast.description}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="default" size="sm" className="flex items-center gap-2">
                    <Upload size={16} />
                    Upload to Spotify
                  </Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Share2 size={16} />
                    Share with Friends
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {(!podcasts || podcasts.length === 0) && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex flex-col">
                <div className="mb-4">
                  <h3 className="text-lg font-medium mb-2">Welcome to Your Podcast Library</h3>
                  <p className="text-sm text-gray-400">This is a sample podcast to help you get started. Try out the buttons below!</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="default" size="sm" className="flex items-center gap-2">
                    <Play size={16} />
                    Play Sample
                  </Button>
                  <Button variant="default" size="sm" className="flex items-center gap-2">
                    <Upload size={16} />
                    Upload to Spotify
                  </Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Share2 size={16} />
                    Share with Friends
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
