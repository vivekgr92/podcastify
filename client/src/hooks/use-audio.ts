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
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [playlist, setPlaylist] = useState<Podcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isAudioReady, setIsAudioReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Initialize audio element with error handling
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    // Try to restore last played podcast
    const lastPlayedPodcast = localStorage.getItem("last-played-podcast");
    if (lastPlayedPodcast) {
      try {
        const podcast = JSON.parse(lastPlayedPodcast);
        setAudioData(podcast);
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (lastPosition) {
          audio.currentTime = parseFloat(lastPosition);
        }
      } catch (error) {
        console.error("Error restoring last played podcast:", error);
        localStorage.removeItem("last-played-podcast");
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, []);

  const constructAudioUrl = useCallback((url: string): string => {
    const baseUrl = window.location.origin;
    return url.startsWith("http") ? url : `${baseUrl}${url}`;
  }, []);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;

      // If it's the same podcast and audio is ready, just toggle play
      if (audioData?.id === podcast.id && isAudioReady) {
        if (!isPlaying) {
          await audio.play();
          setIsPlaying(true);
        }
        return;
      }

      // Save current position if switching podcasts
      if (audioData?.id !== podcast.id && audioData) {
        localStorage.setItem(
          `podcast-${audioData.id}-position`,
          audio.currentTime.toString()
        );
      }

      // Keep playing state if we're just switching tracks
      const wasPlaying = isPlaying;

      // Reset states for new podcast
      setIsAudioReady(false);
      audio.pause();

      const audioUrl = constructAudioUrl(podcast.audioUrl);

      // Validate audio file
      try {
        const response = await fetch(audioUrl, { method: "HEAD" });
        if (!response.ok) {
          throw new Error(`Audio file not accessible: ${response.status}`);
        }
      } catch (error) {
        throw new Error("Could not access audio file. Please check the URL.");
      }

      // Load new audio
      audio.src = audioUrl;
      audio.load();

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          cleanup();
          resolve();
        };

        const handleError = () => {
          cleanup();
          reject(new Error(`Failed to load audio: ${audio.error?.message || "Unknown error"}`));
        };

        const cleanup = () => {
          audio.removeEventListener("canplay", handleCanPlay);
          audio.removeEventListener("error", handleError);
        };

        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("error", handleError);
      });

      // Update state and store current podcast
      setAudioData(podcast);
      setIsAudioReady(true);
      localStorage.setItem("last-played-podcast", JSON.stringify(podcast));

      // Restore last position
      const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
      if (lastPosition) {
        const position = parseFloat(lastPosition);
        if (!isNaN(position) && position > 0) {
          audio.currentTime = position;
        }
      }

      // Play the audio if we were playing before or this is a new track
      if (wasPlaying || audioData?.id !== podcast.id) {
        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsPlaying(false);
      setIsAudioReady(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, toast, constructAudioUrl, isPlaying, isAudioReady]);

  const togglePlay = useCallback(async () => {
    try {
      const audio = audioRef.current;
      if (!audio || !audioData) {
        throw new Error("No audio loaded");
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        if (audioData?.id) {
          localStorage.setItem(
            `podcast-${audioData.id}-position`,
            audio.currentTime.toString()
          );
        }
      } else {
        if (!isAudioReady) {
          const audioUrl = constructAudioUrl(audioData.audioUrl);
          audio.src = audioUrl;
          audio.load();
          await new Promise<void>((resolve, reject) => {
            const handleCanPlay = () => {
              cleanup();
              resolve();
            };

            const handleError = () => {
              cleanup();
              reject(new Error(`Failed to load audio: ${audio.error?.message || "Unknown error"}`));
            };

            const cleanup = () => {
              audio.removeEventListener("canplay", handleCanPlay);
              audio.removeEventListener("error", handleError);
            };

            audio.addEventListener("canplay", handleCanPlay);
            audio.addEventListener("error", handleError);
          });
          setIsAudioReady(true);
        }

        await audio.play();
        audio.playbackRate = playbackSpeed;
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
  }, [audioData, isPlaying, playbackSpeed, isAudioReady, toast, constructAudioUrl]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audioData?.id) {
        localStorage.setItem(
          `podcast-${audioData.id}-position`,
          audio.currentTime.toString()
        );
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsAudioReady(true);
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsAudioReady(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }
      // Auto-play next track if available
      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        play(nextPodcast);
        setCurrentIndex(currentIndex + 1);
      }
    };

    const handleError = () => {
      setIsPlaying(false);
      setIsAudioReady(false);
      toast({
        title: "Error",
        description: `Audio playback error: ${audio.error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [audioData, playbackSpeed, toast, play, playlist, currentIndex]);

  const setPosition = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    audio.currentTime = time;
    setCurrentTime(time);
    localStorage.setItem(`podcast-${audioData.id}-position`, time.toString());
  }, [audioData]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value / 100;
    }
  }, []);

  const changePlaybackSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  }, []);

  const fastForward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.min(audio.currentTime + 10, audio.duration);
      setPosition(newTime);
    }
  }, [setPosition]);

  const rewind = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(audio.currentTime - 10, 0);
      setPosition(newTime);
    }
  }, [setPosition]);

  // Playlist management with proper state updates
  const addToPlaylist = useCallback((podcast: Podcast) => {
    setPlaylist((prev) => {
      if (prev.some((p) => p.id === podcast.id)) {
        toast({
          title: "Already in playlist",
          description: "This podcast is already in your playlist",
        });
        return prev;
      }
      // If this is the first item, set it as current
      if (prev.length === 0) {
        setCurrentIndex(0);
        play(podcast).catch(console.error);
      }
      return [...prev, podcast];
    });
  }, [toast, play]);

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
    setPlaybackSpeed: changePlaybackSpeed,
    fastForward,
    rewind,
    next: async () => {
      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        await play(nextPodcast);
        setCurrentIndex(currentIndex + 1);
      }
    },
    previous: async () => {
      if (currentIndex > 0) {
        const prevPodcast = playlist[currentIndex - 1];
        await play(prevPodcast);
        setCurrentIndex(currentIndex - 1);
      }
    },
    addToPlaylist,
    removeFromPlaylist: useCallback(
      (podcastId: number) => {
        setPlaylist((prev) => {
          const index = prev.findIndex((p) => p.id === podcastId);
          if (index === -1) return prev;

          const newPlaylist = prev.filter((p) => p.id !== podcastId);

          // Adjust currentIndex if necessary
          if (index <= currentIndex) {
            setCurrentIndex((curr) => Math.max(-1, curr - 1));
          }

          return newPlaylist;
        });
      },
      [currentIndex]
    ),
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