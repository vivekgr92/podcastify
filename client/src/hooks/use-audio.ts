import { useState, useRef, useEffect, useCallback } from "react";
import type { Podcast } from "../types/podcast";
import { useToast } from "./use-toast";

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
  // Core audio state
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, _setPlaybackSpeed] = useState(1);

  // Playlist state
  const [playlist, setPlaylist] = useState<Podcast[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.playbackRate = playbackSpeed;

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  // Core playAudio function with improved synchronization
  const playAudio = useCallback(async (podcast: Podcast) => {
    try {
      const audio = audioRef.current;
      if (!audio) throw new Error('Audio element not initialized');

      // If same podcast, toggle play state
      if (audioData?.id === podcast.id) {
        if (isPlaying) {
          audio.pause();
          setIsPlaying(false);
        } else {
          await audio.play();
          setIsPlaying(true);
        }
        return;
      }

      // Save current position if switching podcasts
      if (audioData?.id) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }

      // Reset audio state
      audio.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      // Set up new audio source
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http')
        ? podcast.audioUrl
        : `${baseUrl}${podcast.audioUrl}`;

      audio.src = audioUrl;
      audio.load();

      // Wait for audio to be ready
      await new Promise<void>((resolve, reject) => {
        const handleCanPlay = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('error', handleError);
          resolve();
        };

        const handleError = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('error', handleError);
          reject(new Error(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`));
        };

        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('error', handleError);
      });

      // Update state and start playback
      setAudioData(podcast);
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));

      await audio.play();
      audio.playbackRate = playbackSpeed;
      setIsPlaying(true);

    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
      throw error;
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audioData) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = async () => {
      setIsPlaying(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }

      // Auto-play next track if available
      if (currentIndex < playlist.length - 1) {
        const nextPodcast = playlist[currentIndex + 1];
        setCurrentIndex(currentIndex + 1);
        await playAudio(nextPodcast);
      }
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

    // Add event listeners
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      // Remove event listeners
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioData, currentIndex, playlist, playbackSpeed, toast, playAudio]);

  // Improved togglePlay function
  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !audioData) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        localStorage.setItem(`podcast-${audioData.id}-position`, audioRef.current.currentTime.toString());
      } else {
        await audioRef.current.play();
        audioRef.current.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  // Improved addToPlaylist with better synchronization
  const addToPlaylist = useCallback((podcast: Podcast) => {
    setPlaylist(prev => {
      // Don't add duplicates
      if (prev.some(p => p.id === podcast.id)) {
        // If podcast is already in playlist, update currentIndex
        const index = prev.findIndex(p => p.id === podcast.id);
        setCurrentIndex(index);
        return prev;
      }

      const newPlaylist = [...prev, podcast];
      // Set currentIndex to the new podcast
      setCurrentIndex(newPlaylist.length - 1);
      return newPlaylist;
    });
  }, []);

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

  const clearPlaylist = useCallback(() => {
    setPlaylist([]);
    setCurrentIndex(-1);
    setAudioData(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsPlaying(false);
    }
  }, []);

  // Playback controls
  const setPosition = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    audio.currentTime = time;
    setCurrentTime(time);
  }, [audioData]);

  const setVolume = useCallback((value: number) => {
    if (audioRef.current) {
      audioRef.current.volume = value / 100;
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
      await playAudio(nextPodcast);
    }
  }, [currentIndex, playlist, playAudio]);

  const previous = useCallback(async () => {
    if (currentIndex > 0) {
      const prevPodcast = playlist[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      await playAudio(prevPodcast);
    }
  }, [currentIndex, playlist, playAudio]);

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    playlist,
    currentIndex,
    canvasRef,
    playbackSpeed,
    play: playAudio,
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