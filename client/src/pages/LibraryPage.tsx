import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";
import { Share2, Play, Pause, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useAudio } from "../hooks/use-audio";
import AudioPlayer from "../components/AudioPlayer";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUser } from "@/hooks/use-user";

export default function LibraryPage() {
  const [, setLocation] = useLocation();
  const { play, isPlaying, audioData, togglePlay, cleanup } = useAudio();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout } = useUser();
  if (!logout) return null;

  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [currentPodcastId, setCurrentPodcastId] = useState<number | null>(null);
  
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
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      <nav className="flex justify-between items-center p-6">
        <h1 className="text-xl font-bold text-[#4CAF50]">Podcastify</h1>
        <div className="flex gap-4">
          <Button variant="ghost" onClick={() => setLocation('/')}>Home</Button>
          <Button variant="ghost">Library</Button>
          <Button variant="outline" onClick={() => setLocation('/auth/signup')}>Sign Up</Button>
          <Button 
            onClick={async () => {
              try {
                // First cleanup the audio player
                cleanup();
                
                // Wait a bit to ensure cleanup is complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Then perform logout
                await logout();
                
                // Navigate to auth page
                setLocation('/auth');
              } catch (error) {
                console.error('Logout failed:', error);
                toast({
                  title: "Error",
                  description: "Failed to logout. Please try again.",
                  variant: "destructive"
                });
              }
            }}
            variant="outline"
            className="bg-red-500 hover:bg-red-600 text-white hover:text-white border-none"
          >
            Logout
          </Button>
        </div>
      </nav>

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
                    onClick={async () => {
                      try {
                        if (isPlaying && audioData?.id === podcast.id) {
                          await togglePlay();
                        } else {
                          console.log('Attempting to play podcast:', podcast);
                          await play(podcast);
                        }
                      } catch (error) {
                        console.error('Failed to play audio:', error);
                        toast({
                          title: "Error",
                          description: "Failed to play audio. Please try again.",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    {isPlaying && audioData?.id === podcast.id ? (
                      <Pause className="h-5 w-5 text-black fill-black" />
                    ) : (
                      <Play className="h-5 w-5 text-black fill-black" />
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
                    Share with Friends
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/podcasts/${podcast.id}`, {
                          method: 'DELETE',
                          credentials: 'include'
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to delete podcast');
                        }
                        
                        toast({
                          title: "Success",
                          description: "Podcast deleted successfully"
                        });
                        
                        await queryClient.invalidateQueries({ queryKey: ['podcasts'] });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to delete podcast",
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    Delete
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
                <div className="flex items-center gap-3">
                  <Button 
                    variant="default" 
                    size="icon" 
                    className="rounded-full bg-[#4CAF50] hover:bg-[#45a049] h-10 w-10 p-0 flex items-center justify-center"
                  >
                    <Play className="h-5 w-5 text-black fill-black" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 flex items-center gap-2">
                    <Share2 size={16} />
                    Share with Friends
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Audio Player */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <AudioPlayer />
      </div>
    </div>
  );
}
