import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";
import { Share2, Play, Pause, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useAudio } from "../hooks/use-audio";
import AudioPlayer from "../components/AudioPlayer";
import { useToast } from "@/hooks/use-toast";
import { useState, useCallback } from "react";
import { useUser } from "../hooks/use-user";

export default function LibraryPage() {
  const [, setLocation] = useLocation();
  const { play, isPlaying, audioData, togglePlay } = useAudio();
  const { toast } = useToast();
  const { user } = useUser();
  
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  
  const { data: podcasts, isLoading } = useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/podcasts");
        if (!res.ok) throw new Error("Failed to fetch podcasts");
        return res.json();
      } catch (error) {
        console.error("Failed to fetch podcasts:", error);
        throw error;
      }
    },
    staleTime: 30000,
    retry: 1,
  });

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Please Login</h1>
          <p className="mb-4">You need to be logged in to access your library.</p>
          <Button onClick={() => setLocation('/auth')} className="bg-[#4CAF50] hover:bg-[#45a049]">
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

  const handlePlayPause = useCallback(async (podcast: Podcast) => {
    try {
      if (audioData?.id === podcast.id) {
        // If the same podcast is already loaded, just toggle play/pause
        await togglePlay();
      } else {
        // Otherwise, load and play the new podcast
        await play(podcast);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio. Please try again.",
        variant: "destructive"
      });
    }
  }, [audioData, play, togglePlay, toast]);

  // Ensure audio player is properly synced with library state
  useEffect(() => {
    if (isPlaying && audioData) {
      // Update currently playing podcast in library view
      const playingPodcast = podcasts?.find(p => p.id === audioData.id);
      if (playingPodcast) {
        // Force re-render of the podcast list item
        setLocation(location);
      }
    }
  }, [isPlaying, audioData, podcasts, location, setLocation]);

  return (
    <div className="min-h-screen bg-black text-white relative">
      <main className="max-w-4xl mx-auto px-6 py-8 pb-32">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Your Library</h1>
            <Button onClick={() => setLocation('/')} className="bg-[#4CAF50] hover:bg-[#45a049]">
              Convert New Podcast
            </Button>
          </div>

          {isConverting && (
            <div className="w-full bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Converting to podcast...</span>
                <span className="text-sm text-gray-400">{Math.round(conversionProgress)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div 
                  className="bg-[#4CAF50] h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${conversionProgress}%` }}
                />
              </div>
            </div>
          )}
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePlayPause(podcast);
                    }}
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
                      const link = document.createElement('a');
                      const baseUrl = window.location.origin;
                      const audioUrl = podcast.audioUrl.startsWith('http') 
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
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
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
      
      {/* AudioPlayer will only render if user is authenticated and there's audio data */}
      <AudioPlayer />
    </div>
  );
}
