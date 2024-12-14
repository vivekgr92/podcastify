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

  // Cleanup function to reset audio state
  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  const play = async (podcast: Podcast): Promise<void> => {
    try {
      // Clean up previous audio
      cleanupAudio();

      // Create new audio element
      const audio = new Audio();
      audioRef.current = audio;

      // Configure audio
      audio.preload = 'auto';
      
      // Get base URL
      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;

      console.log('Loading audio from:', audioUrl);

      // Set up event listeners before setting source
      audio.addEventListener('loadedmetadata', () => {
        if (!isNaN(audio.duration) && audio.duration !== Infinity) {
          setDuration(audio.duration);
        }
      });

      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      // Set audio source and load
      audio.src = audioUrl;
      await audio.load();

      // Update state
      setAudioData(podcast);

      // Start playback
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Playback error:', error);
        toast({
          title: "Error",
          description: "Unable to start playback. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error setting up audio:', error);
      toast({
        title: "Error",
        description: "Failed to load audio. Please try again.",
        variant: "destructive",
      });
      cleanupAudio();
    }
  };

  const togglePlay = async (): Promise<void> => {
    if (!audioRef.current || !audioData) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
      toast({
        title: "Error",
        description: "Failed to control playback",
        variant: "destructive",
      });
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