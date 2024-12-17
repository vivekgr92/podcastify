import { useState, useRef, useEffect, useCallback } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AudioHookReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioData: Podcast | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playbackSpeed: number;
  play: (podcast: Podcast) => void;
  togglePlay: () => void;
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
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Only create audio element if we're on the library page
    if (window.location.pathname !== '/library') {
      return;
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
    }
    
    const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
    if (lastPlayedPodcast) {
      try {
        const podcast = JSON.parse(lastPlayedPodcast);
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        
        // Set up the audio source immediately
        const baseUrl = window.location.origin;
        const audioUrl = podcast.audioUrl.startsWith('http') 
          ? podcast.audioUrl 
          : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;
        
        // Only set source if it's different
        if (audio.src !== audioUrl) {
          audio.src = audioUrl;
          audio.load();
        }
        
        if (lastPosition) {
          audio.currentTime = parseFloat(lastPosition);
        }
        
        // Set the audio data after confirming the audio loads correctly
        const handleLoadedMetadata = () => {
          setAudioData(podcast);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      } catch (error) {
        console.error('Error restoring last played podcast:', error);
        // Clear all audio-related storage on error
        localStorage.removeItem('last-played-podcast');
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('podcast-')) {
            localStorage.removeItem(key);
          }
        });
      }
    }
    
    console.log('Audio element created');

    return () => {
      if (audio) {
        // Save current position before cleanup
        if (audioData) {
          localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        }
        audio.pause();
        audio.src = '';
        audioRef.current = null;
        setAudioData(null);
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
      }
    };
  }, []);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      console.log('Starting to play podcast:', podcast);
      
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }

      // Save current position before switching
      if (audioData && audioData.id !== podcast.id) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        audio.pause();
      }

      // Update audio data first to ensure UI updates
      setAudioData(podcast);
      setIsPlaying(true);  // Set playing state immediately
      
      // Construct the audio URL
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;
      
      console.log('Audio URL:', audioUrl);
      
      try {
        // Test if the audio URL is accessible
        const response = await fetch(audioUrl, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`Audio file not accessible: ${response.status}`);
        }
        console.log('Audio file is accessible');
        
        // Set up the audio source
        if (!audio.src || audio.src !== audioUrl) {
          console.log('Setting new audio source');
          audio.src = audioUrl;
          audio.load();
        }
      } catch (error) {
        console.error('Error accessing audio file:', error);
        throw new Error('Failed to access audio file. Please try again.');
      }

      // Set up audio event listeners
      const handleCanPlay = () => {
        console.log('Audio can play');
        audio.removeEventListener('canplay', handleCanPlay);
      };

      const handleError = (e: Event) => {
        console.error('Audio error:', {
          error: e,
          currentSrc: audio.currentSrc,
          readyState: audio.readyState,
          networkState: audio.networkState,
          errorMessage: audio.error?.message
        });
        toast({
          title: "Error",
          description: `Failed to load audio: ${audio.error?.message || 'Unknown error'}`,
          variant: "destructive",
        });
      };

      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleError);

      // Start playback
      await audio.play();
      audio.playbackRate = playbackSpeed;
      setIsPlaying(true);
      console.log('Audio playback started');

      // Save last played podcast
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: "Failed to play audio. Please try again.",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, toast]);

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
            : `${baseUrl}${audioData.audioUrl.startsWith('/') ? '' : '/'}${audioData.audioUrl}`;
          audio.src = audioUrl;
        }

        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      toast({
        title: "Error",
        description: "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      console.log('Audio metadata loaded:', {
        duration: audio.duration,
        currentSrc: audio.currentSrc
      });
      setDuration(audio.duration);
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioData, playbackSpeed]);

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

  const cleanup = useCallback(() => {
    try {
      const audio = audioRef.current;
      if (audio) {
        // Save position before cleanup if we have audio data
        if (audioData) {
          localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        }
        
        // Remove all event listeners
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
        audio.onerror = null;
        
        // Stop playback and clear source properly
        audio.pause();
        audio.src = ''; // Use src property instead of removeAttribute
        audio.load();
        audioRef.current = null;
      }

      // Reset all state
      setAudioData(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      
      // Clear all audio-related storage in a safe way
      try {
        localStorage.removeItem('last-played-podcast');
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('podcast-')) {
            localStorage.removeItem(key);
          }
        });
      } catch (storageError) {
        console.warn('Failed to clear local storage:', storageError);
      }
    } catch (error) {
      console.error('Error during audio cleanup:', error);
    }
  }, [audioData]);

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
  } as const;
}