import { useState, useRef, useEffect } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

export function useAudio() {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { toast } = useToast();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize audio element once
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      const audio = audioRef.current;
      
      // Set up audio event listeners
      const onTimeUpdate = () => {
        setCurrentTime(audio.currentTime);
      };

      const onLoadedMetadata = () => {
        setDuration(audio.duration);
        console.log('Audio loaded, duration:', audio.duration);
      };

      const onEnded = () => {
        setIsPlaying(false);
      };

      const onError = (e: ErrorEvent) => {
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

      const isSamePodcast = audioData?.id === podcast.id;
      const audio = audioRef.current;
      
      // Update audio data
      setAudioData(podcast);

      // Construct audio URL
      const audioSrc = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${window.location.origin}${podcast.audioUrl}`;

      console.log('Playing audio from:', audioSrc);

      // Only update source if it's a different podcast
      if (!isSamePodcast) {
        audio.src = audioSrc;
        await audio.load();
      }

      // Reset time if it's a new podcast
      if (!isSamePodcast) {
        audio.currentTime = 0;
      }

      // Play the audio
      try {
        await audio.play();
        setIsPlaying(true);
        console.log('Audio playback started');
      } catch (playError) {
        console.error('Playback error:', playError);
        throw playError;
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: "Failed to play audio. Please try again.",
        variant: "destructive",
      });
      setIsPlaying(false);
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
        await audio.play();
        setIsPlaying(true);
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
