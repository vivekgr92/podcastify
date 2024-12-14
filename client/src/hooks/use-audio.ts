import { useState, useRef, useEffect } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AudioHookReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioData: Podcast | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  play: (podcast: Podcast) => Promise<void>;
  togglePlay: () => Promise<void>;
  setPosition: (time: number) => void;
  setVolume: (value: number) => void;
}

export function useAudio(): AudioHookReturn {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const { toast } = useToast();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audioRef.current = audio;

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };

      const handleLoadedMetadata = () => {
        if (!isNaN(audio.duration) && audio.duration !== Infinity) {
          setDuration(audio.duration);
          console.log('Audio loaded, duration:', audio.duration);
        }
      };

      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      const handleError = (e: ErrorEvent) => {
        console.error('Audio error:', e);
        toast({
          title: "Error",
          description: "Failed to load or play audio",
          variant: "destructive",
        });
        setIsPlaying(false);
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
        audio.pause();
        audio.src = '';
      };
    }
  }, [toast]);

  const play = async (podcast: Podcast): Promise<void> => {
    try {
      if (!audioRef.current) {
        throw new Error('Audio element not initialized');
      }

      const audio = audioRef.current;
      
      // Clean up existing audio and remove all event listeners
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      }
      
      // Reset audio state and clear any previous errors
      audio.currentTime = 0;
      setCurrentTime(0);
      audio.onerror = null;
      audio.onended = null;
      
      // Construct the full audio URL with cache-busting
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}?t=${Date.now()}`;

      console.log('Playing audio from:', audioUrl);

      // Set up new audio source with enhanced preload settings
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.src = audioUrl;
      
      // Add specific error handling for audio loading
      audio.onerror = (e) => {
        console.error('Audio loading error:', e);
        throw new Error(`Failed to load audio file: ${e.toString()}`);
      };
      
      // Set up error handling before loading
      const errorHandler = (e: ErrorEvent) => {
        console.error('Audio loading error:', e);
        throw new Error('Failed to load audio file');
      };
      audio.addEventListener('error', errorHandler);
      
      try {
        await audio.load();
        
        // Wait for audio to be ready with timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Audio loading timeout'));
          }, 15000); // Increased timeout for larger files

          const handleCanPlay = () => {
            clearTimeout(timeout);
            audio.removeEventListener('canplay', handleCanPlay);
            resolve();
          };

          audio.addEventListener('canplay', handleCanPlay);
        });

        // Update audio data only after successful load
        setAudioData(podcast);
        if (!isNaN(audio.duration) && audio.duration !== Infinity) {
          setDuration(audio.duration);
        }

        // Start playback
        await audio.play();
        setIsPlaying(true);
      } finally {
        audio.removeEventListener('error', errorHandler);
      }

    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
      setIsPlaying(false);
      setAudioData(null);
      if (audioRef.current) {
        audioRef.current.src = '';
      }
    }
  };

  const togglePlay = async (): Promise<void> => {
    if (!audioRef.current || !audioData) return;

    try {
      const audio = audioRef.current;
      
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      toast({
        title: "Error",
        description: "Failed to control playback",
        variant: "destructive",
      });
      setIsPlaying(false);
    }
  };

  const setPosition = (time: number): void => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (value: number): void => {
    if (audioRef.current) {
      audioRef.current.volume = value / 100;
    }
  };

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    canvasRef,
    play,
    togglePlay,
    setPosition,
    setVolume,
  };
}