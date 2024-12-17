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

  // Function to construct and validate audio URL
  const getValidAudioUrl = useCallback((podcast: Podcast): string => {
    try {
      if (!podcast?.audioUrl) {
        throw new Error('Invalid podcast data: Missing audio URL');
      }

      // Clean up the URL path
      const audioUrl = podcast.audioUrl.trim();
      const baseUrl = window.location.origin;
      
      // Handle absolute URLs
      if (audioUrl.startsWith('http')) {
        const url = new URL(audioUrl);
        // Ensure the URL is valid
        if (!url.pathname.endsWith('.mp3')) {
          console.warn('Audio URL does not end with .mp3:', audioUrl);
        }
        return url.toString();
      }
      
      // Handle relative URLs
      let relativePath = audioUrl;
      if (!relativePath.startsWith('/')) {
        relativePath = `/${relativePath}`;
      }
      
      // Ensure the URL is properly encoded
      const encodedPath = relativePath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
      
      const fullUrl = new URL(encodedPath, baseUrl);
      
      // Log the constructed URL for debugging
      console.log('Constructed audio URL:', fullUrl.toString());
      
      return fullUrl.toString();
    } catch (error) {
      console.error('Error constructing audio URL:', error);
      return '';
    }
  }, []);

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
      audio.currentTime = 0;
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
    let mounted = true;

    const initializeAudio = async () => {
      try {
        let audio = audioRef.current;
        if (!audio) {
          audio = new Audio();
          audio.preload = 'auto';
          audioRef.current = audio;
        }

        // Only restore last played podcast if we're on the library page
        if (location === '/library') {
          const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
          if (lastPlayedPodcast) {
            const podcast = JSON.parse(lastPlayedPodcast);
            if (podcast?.audioUrl) {
              const audioUrl = getValidAudioUrl(podcast);
              if (audioUrl) {
                try {
                  const response = await fetch(audioUrl, { method: 'HEAD' });
                  if (response.ok && mounted) {
                    if (audio.src !== audioUrl) {
                      audio.src = audioUrl;
                      audio.load();
                    }
                    
                    const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
                    if (lastPosition) {
                      const position = parseFloat(lastPosition);
                      if (!isNaN(position)) {
                        audio.currentTime = position;
                      }
                    }
                    
                    setAudioData(podcast);
                  }
                } catch (error) {
                  console.error('Error verifying audio URL:', error);
                  if (mounted) cleanup();
                }
              }
            }
          }
        } else {
          cleanup();
        }
      } catch (error) {
        console.error('Error initializing audio:', error);
        if (mounted) cleanup();
      }
    };

    initializeAudio();
    
    return () => {
      mounted = false;
      cleanup();
    };
  }, [cleanup, location, getValidAudioUrl]);

  // Play function
  const play = useCallback(async (podcast: Podcast) => {
    try {
      if (!podcast?.audioUrl) {
        throw new Error('Invalid podcast data: Missing audio URL');
      }

      console.log('Attempting to play podcast:', podcast);

      // Create new audio element if needed
      let audio = audioRef.current;
      const needsNewAudio = !audio || audio.error;
      
      if (needsNewAudio) {
        if (audio) {
          audio.removeAttribute('src');
          audio.load();
        }
        audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;
      }

      // Save current position before switching
      if (audioData?.id !== podcast.id && audioData) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      }

      // Construct and validate the audio URL
      const audioUrl = getValidAudioUrl(podcast);
      console.log('Audio URL:', audioUrl);

      if (!audioUrl) {
        throw new Error('Failed to construct valid audio URL');
      }

      // Validate URL is accessible
      try {
        const response = await fetch(audioUrl, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Failed to access audio file: ${response.statusText}`);
        }
        console.log('Audio file is accessible');
      } catch (error) {
        throw new Error(`Failed to validate audio URL: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update state first
      setAudioData(podcast);
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));

      // Set source and load
      if (audio.src !== audioUrl) {
        console.log('Setting new audio source:', audioUrl);
        audio.src = audioUrl;
        await new Promise((resolve) => {
          audio.onloadedmetadata = resolve;
          audio.load();
        });
      }

      // Configure audio
      audio.volume = 1;
      audio.playbackRate = playbackSpeed;
      
      // Verify source is set
      if (!audio.src) {
        throw new Error('Audio source not properly set');
      }

      // Start playback
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
        console.log('Audio playback started successfully');
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Audio setup error:', error);
      // Don't cleanup immediately on error, try to recover
      if (error instanceof Error && error.message.includes('source not properly set')) {
        // Try to recover by reinitializing the audio element
        const audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;
        
        try {
          await play(podcast); // Retry once
          return;
        } catch (retryError) {
          console.error('Retry failed:', retryError);
        }
      }
      
      cleanup();
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, cleanup, toast, getValidAudioUrl]);

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
          const audioUrl = getValidAudioUrl(audioData);
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
  }, [audioData, isPlaying, playbackSpeed, toast, getValidAudioUrl]);

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

    const handleError = async (e: Event) => {
      const error = e as ErrorEvent;
      console.error('Audio error:', {
        error,
        currentSrc: audio.currentSrc,
        readyState: audio.readyState,
        networkState: audio.networkState,
        errorMessage: audio.error?.message || 'Unknown error'
      });

      if (!audioData?.audioUrl) {
        cleanup();
        return;
      }

      try {
        // Attempt to recover by reloading the audio
        const audioUrl = getValidAudioUrl(audioData);
        const response = await fetch(audioUrl, { method: 'HEAD' });
        
        if (response.ok) {
          audio.src = audioUrl;
          audio.load();
          if (isPlaying) {
            await audio.play();
          }
          return;
        }
      } catch (recoverError) {
        console.error('Failed to recover from audio error:', recoverError);
      }
      
      cleanup();
      toast({
        title: "Error",
        description: "Failed to play audio. Please try again.",
        variant: "destructive"
      });
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
  }, [audioData, playbackSpeed, cleanup, toast, getValidAudioUrl, isPlaying]);

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
