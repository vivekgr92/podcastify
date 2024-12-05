import { useState, useRef, useEffect } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

export function useAudio() {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { toast } = useToast();
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize audio element once
  useEffect(() => {
    audioRef.current = new Audio();
    
    // Set up audio event listeners
    audioRef.current.addEventListener('timeupdate', () => {
      setCurrentTime(audioRef.current?.currentTime || 0);
    });

    audioRef.current.addEventListener('loadedmetadata', () => {
      setDuration(audioRef.current?.duration || 0);
    });

    audioRef.current.addEventListener('ended', () => {
      setIsPlaying(false);
    });

    audioRef.current.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      toast({
        title: "Error",
        description: "Failed to load audio",
        variant: "destructive",
      });
      setIsPlaying(false);
    });

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const play = async (podcast: Podcast) => {
    try {
      if (!audioRef.current) return;

      const isSamePodcast = audioData?.id === podcast.id;
      
      // Update audio data immediately
      setAudioData(podcast);

      // Construct audio URL
      const audioSrc = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${window.location.origin}${podcast.audioUrl}`;

      // Only update source if it's a different podcast
      if (!isSamePodcast) {
        audioRef.current.src = audioSrc;
        audioRef.current.load();
      }

      // Play the audio
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: "Failed to play audio",
        variant: "destructive",
      });
      setIsPlaying(false);
    }
  };

  const togglePlay = async () => {
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