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
  // State management
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [playlist, setPlaylist] = useState<Podcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, _setPlaybackSpeed] = useState(1);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Initialize audio element and handle playback state
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const setupAudioState = () => {
      if (!audio) return;
      audio.playbackRate = playbackSpeed;

      // Try to restore last played podcast
      const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
      if (lastPlayedPodcast) {
        try {
          const podcast = JSON.parse(lastPlayedPodcast);
          setAudioData(podcast);

          const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
          if (lastPosition) {
            audio.currentTime = parseFloat(lastPosition);
          }

          const baseUrl = window.location.origin;
          const audioUrl = podcast.audioUrl.startsWith('http')
            ? podcast.audioUrl
            : `${baseUrl}${podcast.audioUrl}`;

          audio.src = audioUrl;
          audio.load();
        } catch (error) {
          console.error('Error restoring last played podcast:', error);
          localStorage.removeItem('last-played-podcast');
        }
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
    };

    const handleError = (e: ErrorEvent) => {
      console.error('Audio error:', e);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: "Failed to play audio",
        variant: "destructive",
      });
    };

    // Setup event listeners
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);

    // Initial setup
    setupAudioState();

    return () => {
      if (!audio) return;
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [playbackSpeed, toast]);

  // Audio playback control functions
  const handlePlaybackChange = useCallback(async (shouldPlay: boolean) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    try {
      if (shouldPlay) {
        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }
    } catch (error) {
      console.error('Error handling playback:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: "Failed to control playback",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, toast]);

  const togglePlay = useCallback(async () => {
    await handlePlaybackChange(!isPlaying);
  }, [isPlaying, handlePlaybackChange]);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      const audio = audioRef.current;
      if (!audio) {
        throw new Error('Audio element not initialized');
      }

      // If we're already playing this podcast, just toggle playback
      if (audioData?.id === podcast.id) {
        await handlePlaybackChange(!isPlaying);
        return;
      }

      // Save current position before switching
      if (audioData?.id) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }

      // Stop current playback and reset state
      audio.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      // Prepare new audio
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http')
        ? podcast.audioUrl
        : `${baseUrl}${podcast.audioUrl}`;

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
          reject(new Error(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`));
        };

        const cleanup = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('error', handleError);
        };

        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('error', handleError);
      });

      // Update state and start playback
      setAudioData(podcast);
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
      await handlePlaybackChange(true);

    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, handlePlaybackChange, toast]);

  // Playlist management
  const addToPlaylist = useCallback((podcast: Podcast) => {
    setPlaylist(prev => {
      if (prev.some(p => p.id === podcast.id)) {
        return prev;
      }

      const newPlaylist = [...prev, podcast];

      // Set as current if first track or no current track
      if (prev.length === 0 || currentIndex === -1) {
        setCurrentIndex(newPlaylist.length - 1);
        play(podcast).catch(console.error);
      }

      return newPlaylist;
    });
  }, [currentIndex, play]);

  const removeFromPlaylist = useCallback((podcastId: number) => {
    setPlaylist(prev => {
      const index = prev.findIndex(p => p.id === podcastId);
      if (index === -1) return prev;

      const newPlaylist = prev.filter(p => p.id !== podcastId);

      // Adjust currentIndex if necessary
      if (index <= currentIndex) {
        setCurrentIndex(curr => Math.max(-1, curr - 1));
      }

      return newPlaylist;
    });
  }, [currentIndex]);

  // Handle audio ended event and auto-play next
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = async () => {
      setIsPlaying(false);

      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }

      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        setCurrentIndex(currentIndex + 1);
        await play(nextPodcast);
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioData, currentIndex, playlist, play]);

  // Playback control functions
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

  const setPlaybackSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      _setPlaybackSpeed(speed);
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

  const next = useCallback(async () => {
    if (currentIndex < playlist.length - 1) {
      const nextPodcast = playlist[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      await play(nextPodcast);
    }
  }, [currentIndex, playlist, play]);

  const previous = useCallback(async () => {
    if (currentIndex > 0) {
      const prevPodcast = playlist[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      await play(prevPodcast);
    }
  }, [currentIndex, playlist, play]);

  const clearPlaylist = useCallback(() => {
    setPlaylist([]);
    setCurrentIndex(-1);
    setAudioData(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
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
    setPlaybackSpeed,
    fastForward,
    rewind,
    next,
    previous,
    addToPlaylist,
    removeFromPlaylist,
    clearPlaylist,
    setCurrentIndex,
    setPlaylist,
  };
}