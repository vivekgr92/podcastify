import { useState, useRef, useEffect, useCallback } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AudioHookReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioData: Podcast | null;
  playlist: Podcast[];
  currentIndex: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playbackSpeed: number;
  play: (podcast: Podcast) => Promise<void>;
  togglePlay: () => Promise<void>;
  setPosition: (time: number) => void;
  setVolume: (value: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  fastForward: () => void;
  rewind: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  addToPlaylist: (podcast: Podcast) => void;
  removeFromPlaylist: (podcastId: number) => void;
  clearPlaylist: () => void;
  setCurrentIndex: (index: number) => void;
  setPlaylist: (playlist: Podcast[]) => void;
}

export function useAudio(): AudioHookReturn {
  // State
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [playlist, setPlaylist] = useState<Podcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isAudioReady, setIsAudioReady] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const constructAudioUrl = useCallback((url: string): string => {
    if (!url) {
      console.error("Empty URL provided to constructAudioUrl");
      return "";
    }

    try {
      // Check if it's already a valid URL
      new URL(url);
      console.log("Using direct audio URL:", url);
      return url;
    } catch {
      // If not a valid URL, assume it's a relative path and construct full URL
      const baseUrl = window.location.origin;
      const fullUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      console.log("Constructed audio URL:", fullUrl);
      return fullUrl;
    }
  }, []);

  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      console.log("Creating new Audio element");
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      if (!podcast?.audioUrl) {
        throw new Error("Invalid podcast or missing audio URL");
      }

      console.log("Starting to play podcast:", {
        id: podcast.id,
        title: podcast.title,
        audioUrl: podcast.audioUrl
      });

      const audio = initAudio();

      // If it's the same podcast and audio is ready, just resume
      if (audioData?.id === podcast.id && isAudioReady) {
        console.log("Same podcast, toggling play state");
        if (!isPlaying) {
          await audio.play();
          setIsPlaying(true);
        }
        return;
      }

      // Reset states for new podcast
      console.log("Loading new podcast, resetting states");
      setIsPlaying(false);
      setIsAudioReady(false);
      setDuration(0);
      setCurrentTime(0);
      audio.pause();

      const audioUrl = constructAudioUrl(podcast.audioUrl);
      if (!audioUrl) {
        throw new Error("Failed to construct audio URL");
      }

      // Set new audio source
      console.log("Setting audio source:", audioUrl);
      audio.src = audioUrl;
      audio.load();

      // Update state and store current podcast
      setAudioData(podcast);

      try {
        // Wait for metadata to load
        await new Promise<void>((resolve, reject) => {
          const handleLoadedMetadata = () => {
            console.log("Metadata loaded, duration:", audio.duration);
            setDuration(audio.duration);
            setIsAudioReady(true);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("error", handleError);
            resolve();
          };

          const handleError = (e: ErrorEvent) => {
            const errorMsg = audio.error?.message || "Unknown error";
            console.error("Audio loading error:", errorMsg, e);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("error", handleError);
            reject(new Error(`Failed to load audio: ${errorMsg}`));
          };

          audio.addEventListener("loadedmetadata", handleLoadedMetadata);
          audio.addEventListener("error", handleError);

          // Set a timeout for loading
          setTimeout(() => {
            reject(new Error("Timeout while loading audio metadata"));
          }, 10000);
        });

        // Start playback
        console.log("Starting audio playback");
        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      } catch (error) {
        console.error("Audio playback error:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsPlaying(false);
      setIsAudioReady(false);
      setAudioData(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
      throw error;
    }
  }, [audioData, playbackSpeed, isPlaying, isAudioReady, toast, constructAudioUrl, initAudio]);

  // Setup audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      console.log("Audio metadata loaded:", {
        duration: audio.duration,
        currentTime: audio.currentTime
      });
      setDuration(audio.duration);
      setIsAudioReady(true);
      audio.playbackRate = playbackSpeed;
    };

    const handleLoadedData = () => {
      console.log("Audio data loaded");
      setIsAudioReady(true);
    };

    const handleEnded = () => {
      console.log("Audio playback ended");
      setIsPlaying(false);
      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        setCurrentIndex(currentIndex + 1);
        play(nextPodcast).catch(console.error);
      }
    };

    const handleError = () => {
      const errorMessage = audio.error?.message || "Unknown error";
      console.error("Audio error:", errorMessage);
      setIsPlaying(false);
      setIsAudioReady(false);
      setAudioData(null);
      toast({
        title: "Error",
        description: `Audio playback error: ${errorMessage}`,
        variant: "destructive",
      });
    };

    // Add event listeners
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("loadeddata", handleLoadedData);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    // Cleanup
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("loadeddata", handleLoadedData);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioData, currentIndex, playlist, playbackSpeed, toast, play]);

  const togglePlay = useCallback(async () => {
    try {
      const audio = audioRef.current;
      if (!audio || !audioData?.audioUrl) {
        console.warn("Cannot toggle play: No audio element or invalid audio URL");
        return;
      }

      console.log("Toggling play state:", { isPlaying, audioUrl: audioData.audioUrl });

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error toggling play:", error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, toast]);

  const setPosition = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    audio.currentTime = time;
    setCurrentTime(time);
  }, [audioData]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value / 100;
    }
  }, []);

  const updatePlaybackSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    playlist,
    currentIndex,
    canvasRef,
    playbackSpeed,
    play,
    togglePlay,
    setPosition,
    setVolume,
    setPlaybackSpeed: updatePlaybackSpeed,
    fastForward: useCallback(() => {
      const audio = audioRef.current;
      if (audio && duration > 0) {
        const newTime = Math.min(audio.currentTime + 10, duration);
        setPosition(newTime);
      }
    }, [duration, setPosition]),
    rewind: useCallback(() => {
      const audio = audioRef.current;
      if (audio) {
        const newTime = Math.max(audio.currentTime - 10, 0);
        setPosition(newTime);
      }
    }, [setPosition]),
    next: async () => {
      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        setCurrentIndex(currentIndex + 1);
        await play(nextPodcast);
      }
    },
    previous: async () => {
      if (currentIndex > 0) {
        const prevPodcast = playlist[currentIndex - 1];
        setCurrentIndex(currentIndex - 1);
        await play(prevPodcast);
      }
    },
    addToPlaylist: useCallback((podcast: Podcast) => {
      setPlaylist((prev) => {
        if (prev.some((p) => p.id === podcast.id)) {
          toast({
            title: "Already in playlist",
            description: "This podcast is already in your playlist",
          });
          return prev;
        }
        if (prev.length === 0) {
          setCurrentIndex(0);
        }
        return [...prev, podcast];
      });
    }, [toast]),
    removeFromPlaylist: useCallback((podcastId: number) => {
      setPlaylist((prev) => {
        const index = prev.findIndex((p) => p.id === podcastId);
        if (index === -1) return prev;

        const newPlaylist = prev.filter((p) => p.id !== podcastId);
        if (index <= currentIndex) {
          setCurrentIndex((curr) => Math.max(-1, curr - 1));
        }
        return newPlaylist;
      });
    }, [currentIndex]),
    clearPlaylist: useCallback(() => {
      setPlaylist([]);
      setCurrentIndex(-1);
      setAudioData(null);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      setIsPlaying(false);
      setIsAudioReady(false);
    }, []),
    setCurrentIndex,
    setPlaylist,
  };
}