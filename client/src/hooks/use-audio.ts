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

  // Initialize audio element once
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      const audio = audioRef.current;
      
      // Set up audio event listeners with proper types
      const onTimeUpdate = (): void => {
        setCurrentTime(audio.currentTime);
      };

      const onLoadedMetadata = (): void => {
        setDuration(audio.duration);
        console.log('Audio loaded, duration:', audio.duration);
      };

      const onEnded = (): void => {
        setIsPlaying(false);
      };

      const onError = (e: Event): void => {
        console.error('Audio error:', e);
        toast({
          title: "Error",
          description: "Failed to load audio",
          variant: "destructive",
        });
        setIsPlaying(false);
      };

      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.pause();
        audio.src = '';
      };
    }
  }, []);

  const play = async (podcast: Podcast) => {
    try {
      if (!audioRef.current) {
        console.error('Audio element not initialized');
        return;
      }

      const audio = audioRef.current;
      const isSamePodcast = audioData?.id === podcast.id;
      
      // Construct audio URL
      let audioSrc = podcast.audioUrl;
      if (!audioSrc.startsWith('http')) {
        // Get the base URL without any path
        const baseUrl = window.location.origin;
        audioSrc = `${baseUrl}${audioSrc}`;
      }

      console.log('Playing audio from:', audioSrc);

      // Always set audio source
      audio.src = audioSrc;
      
      // Set up event listeners for this specific load/play attempt
      const loadPromise = new Promise((resolve, reject) => {
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          resolve(undefined);
        };
        
        const onError = (e: Event) => {
          console.error('Audio loading error:', e);
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          reject(new Error(`Failed to load audio: ${audioSrc}`));
        };

        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('error', onError);
      });

      // Force load the audio
      audio.load();

      // Load the audio
      audio.load();
      
      // Wait for the audio to be ready
      await loadPromise;
      
      // Update state after successful load
      setAudioData(podcast);
      
      if (!isSamePodcast) {
        audio.currentTime = 0;
      }

      // Play the audio
      await audio.play();
      setIsPlaying(true);
      console.log('Audio playback started');

    } catch (error) {
      console.error('Error playing audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error",
        description: `Failed to play audio: ${errorMessage}. Please try again.`,
        variant: "destructive",
      });
      setIsPlaying(false);
      setAudioData(null);
    }
  };

  const togglePlay = async () => {
    if (!audioRef.current || !audioData) {
      console.warn('Cannot toggle play - no audio loaded');
      return;
    }

    try {
      const audio = audioRef.current;
      
      if (isPlaying) {
        console.log('Pausing audio');
        audio.pause();
        setIsPlaying(false);
      } else {
        console.log('Resuming audio');
        // Ensure audio source is still valid
        if (!audio.src) {
          const audioSrc = audioData.audioUrl.startsWith('http') 
            ? audioData.audioUrl 
            : `${window.location.origin}${audioData.audioUrl}`;
          audio.src = audioSrc;
          audio.load();
        }
        
        // Play with error handling
        try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
            setIsPlaying(true);
          }
        } catch (playError) {
          console.error('Playback error:', playError);
          throw playError;
        }
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      toast({
        title: "Error",
        description: "Failed to toggle playback. Please try again.",
        variant: "destructive",
      });
      setIsPlaying(false);
    }
  };

  const setPosition = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (value: number) => {
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
