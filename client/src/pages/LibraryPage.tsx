import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";
import { Share2, Play, Pause, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useAudio } from "../hooks/use-audio";
import AudioPlayer from "../components/AudioPlayer";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";
import { useUser } from "../hooks/use-user";

export default function LibraryPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { play, isPlaying, audioData, togglePlay } = useAudio();
  const { toast } = useToast();

  const { data: podcasts, isLoading } = useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: async () => {
      const res = await fetch("/api/podcasts");
      if (!res.ok) throw new Error("Failed to fetch podcasts");
      return res.json();
    },
    staleTime: 30000,
    retry: 1,
  });

  const handlePlayPause = useCallback((podcast: Podcast) => {
    if (audioData?.id === podcast.id) {
      togglePlay();
    } else {
      play(podcast);
    }
  }, [audioData?.id, play, togglePlay]);

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Please Login</h1>
          <p className="mb-4">You need to be logged in to access your library.</p>
          <Button 
            onClick={() => setLocation("/auth")} 
            className="bg-[#4CAF50] hover:bg-[#45a049]"
          >
            Login
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-md mx-auto text-center">
          <p>Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      <main className="max-w-4xl mx-auto px-6 py-8 pb-32">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Your Library</h1>
            <Button 
              onClick={() => setLocation("/")} 
              className="bg-[#4CAF50] hover:bg-[#45a049]"
            >
              Convert New Podcast
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {podcasts?.map((podcast) => (
            <div key={podcast.id} className="bg-gray-900 rounded-lg p-4">
              <div className="flex flex-col">
                <div className="mb-4">
                  <h3 className="text-lg font-medium mb-2">{podcast.title}</h3>
                  <p className="text-sm text-gray-400">{podcast.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="default"
                    size="icon"
                    className="rounded-full bg-[#4CAF50] hover:bg-[#45a049] h-10 w-10 p-0 flex items-center justify-center"
                    onClick={() => handlePlayPause(podcast)}
                    title={isPlaying && audioData?.id === podcast.id ? "Pause" : "Play"}
                  >
                    {isPlaying && audioData?.id === podcast.id ? (
                      <Pause className="h-5 w-5 text-white" />
                    ) : (
                      <Play className="h-5 w-5 text-white ml-0.5" />
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => {
                      const link = document.createElement("a");
                      const baseUrl = window.location.origin;
                      const audioUrl = podcast.audioUrl.startsWith("http")
                        ? podcast.audioUrl
                        : `${baseUrl}${podcast.audioUrl}`;
                      link.href = audioUrl;
                      link.download = `${podcast.title}.mp3`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <Download size={16} />
                    Download
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2"
                  >
                    <Share2 size={16} />
                    Share
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
                  <p className="text-sm text-gray-400">Your library is empty. Convert your first podcast to get started!</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <AudioPlayer />
    </div>
  );
}