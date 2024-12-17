import { useState, useRef, useEffect, useCallback } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface AudioHookReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioData: Podcast | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playbackSpeed: number;
  play: (podcast: Podcast) => Promise<void>;
  togglePlay: () => Promise<void>;
  setPosition: (time: number) => void;
  setVolume: (value: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  fastForward: () => void;
  rewind: () => void;
  cleanup: () => void;
}

export function useAudio(): AudioHookReturn {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [location] = useLocation();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Cleanup function
  const cleanup = useCallback(() => {
    if (!audioRef.current) return;

    try {
      const audio = audioRef.current;
      
      // Save current position if audio is playing
      if (audioData && !audio.paused) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }
      
      // Stop playback and remove event listeners
      audio.pause();
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.onerror = null;
      
      // Clear source and release resources
      audio.src = '';
      audio.load();
      
      // Reset state
      setAudioData(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setPlaybackSpeed(1);

      // Clear storage only if we're not on the library page
      if (location !== '/library') {
        localStorage.removeItem('last-played-podcast');
        Object.keys(localStorage)
          .filter(key => key.startsWith('podcast-'))
          .forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.error('Error during audio cleanup:', error);
    }
  }, [audioData, location]);

  // Initialize audio element and restore last played podcast
  useEffect(() => {
    if (location !== '/library') {
      cleanup();
      return;
    }

    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;

      // Restore last played podcast
      const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
      if (lastPlayedPodcast) {
        try {
          const podcast = JSON.parse(lastPlayedPodcast);
          const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
          
          if (podcast?.audioUrl) {
            const baseUrl = window.location.origin;
            const audioUrl = podcast.audioUrl.startsWith('http') 
              ? podcast.audioUrl 
              : `${baseUrl}${podcast.audioUrl}`;
            
            audio.src = audioUrl;
            audio.load();
            
            if (lastPosition) {
              audio.currentTime = parseFloat(lastPosition);
            }
            
            setAudioData(podcast);
          }
        } catch (error) {
          console.error('Error restoring last played podcast:', error);
        }
      }
    }

    return cleanup;
  }, [cleanup, location]);

  // Play function
  const play = useCallback(async (podcast: Podcast) => {
    try {
      if (!podcast?.audioUrl) {
        throw new Error('Invalid podcast data');
      }

      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;
      }

      // Save current position before switching
      if (audioData?.id !== podcast.id && audioData) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }

      // Construct the audio URL
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl}`;

      // Update source if different
      if (audio.src !== audioUrl) {
        audio.src = audioUrl;
        audio.load();
      }

      // Update state
      setAudioData(podcast);
      setIsPlaying(true);

      // Configure audio
      audio.volume = 1;
      audio.playbackRate = playbackSpeed;

      // Play with error handling
      await audio.play();
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
    } catch (error) {
      console.error('Audio setup error:', error);
      cleanup();
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, cleanup, toast]);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      } else {
        if (!audio.src) {
          const baseUrl = window.location.origin;
          const audioUrl = audioData.audioUrl.startsWith('http')
            ? audioData.audioUrl
            : `${baseUrl}${audioData.audioUrl}`;
          audio.src = audioUrl;
          audio.load();
        }
        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Toggle play error:', error);
      toast({
        title: "Error",
        description: "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  // Event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', {
        error: e,
        currentSrc: audio.currentSrc,
        readyState: audio.readyState,
        networkState: audio.networkState,
        errorMessage: audio.error?.message || 'Unknown error'
      });
      cleanup();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioData, playbackSpeed, cleanup]);

  // Position control
  const setPosition = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    audio.currentTime = time;
    setCurrentTime(time);
    localStorage.setItem(`podcast-${audioData.id}-position`, time.toString());
  }, [audioData]);

  // Volume control
  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value / 100;
    }
  }, []);

  // Playback speed control
  const changePlaybackSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  }, []);

  // Fast forward and rewind
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

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    canvasRef,
    playbackSpeed,
    play,
    togglePlay,
    setPosition,
    setVolume,
    setPlaybackSpeed: changePlaybackSpeed,
    fastForward,
    rewind,
    cleanup,
  };
}
