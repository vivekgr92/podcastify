import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";
import { Share2, Play, Pause, Trash2, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAudio } from "../hooks/use-audio";
import AudioPlayer from "../components/AudioPlayer";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";
import { useUser } from "../hooks/use-user";
import { cn } from "@/lib/utils";

export default function LibraryPage() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const queryClient = useQueryClient();
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

  // Handle play/pause for any podcast in the library
  const handlePlay = useCallback(async (podcast: Podcast) => {
    try {
      if (audioData?.id === podcast.id && isPlaying) {
        // If this podcast is currently playing, pause it
        await togglePlay();
      } else if (audioData?.id === podcast.id && !isPlaying) {
        // If this podcast is loaded but paused, resume it
        await togglePlay();
      } else {
        // Load and play a new podcast
        await play(podcast);
      }
    } catch (error) {
      console.error('Error playing podcast:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play podcast",
        variant: "destructive",
      });
    }
  }, [play, togglePlay, audioData, isPlaying, toast]);

  // Ensure AudioPlayer is rendered only when we have audio data
  const shouldShowPlayer = Boolean(user && (audioData || isPlaying));

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
                    className={cn(
                      "rounded-full h-10 w-10 p-0 flex items-center justify-center",
                      audioData?.id === podcast.id && isPlaying
                        ? "bg-[#45a049] hover:bg-[#3d8b3f]"
                        : "bg-[#4CAF50] hover:bg-[#45a049]"
                    )}
                    onClick={() => handlePlay(podcast)}
                    title={audioData?.id === podcast.id && isPlaying ? "Pause" : "Play"}
                  >
                    {audioData?.id === podcast.id && isPlaying ? (
                      <Pause className="h-5 w-5 text-white" />
                    ) : (
                      <Play className="h-5 w-5 text-white ml-0.5" />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500"
                      >
                        <Trash2 size={16} />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your
                          podcast and remove the audio file from our servers.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-500 hover:bg-red-600"
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/podcasts/${podcast.id}`, {
                                method: "DELETE",
                                credentials: "include",
                              });

                              if (!response.ok) {
                                throw new Error("Failed to delete podcast");
                              }

                              toast({
                                title: "Success",
                                description: "Podcast deleted successfully",
                              });

                              // Invalidate the podcasts query to refresh the list
                              await queryClient.invalidateQueries({ queryKey: ["podcasts"] });
                            } catch (error) {
                              console.error("Error deleting podcast:", error);
                              toast({
                                title: "Error",
                                description:
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to delete podcast",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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

      {/* Render AudioPlayer when user is authenticated */}
      {shouldShowPlayer && <AudioPlayer />}
    </div>
  );
}