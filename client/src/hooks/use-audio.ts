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
    const audio = new Audio();
    audioRef.current = audio;

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

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
      // Restore playback speed when loading new audio
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      toast({
        title: "Error",
        description: "Failed to load audio",
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
    };
  }, [audioData, toast, playbackSpeed]);

  const play = useCallback(async (podcast: Podcast) => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
    }

    try {
      // Always update audio data first to ensure UI updates
      setAudioData(podcast);
      
      // Set up the audio source if it's a new podcast or source has changed
      if (!audioData || audioData.id !== podcast.id) {
        const audioUrl = podcast.audioUrl.startsWith('http')
          ? podcast.audioUrl
          : `${window.location.origin}${podcast.audioUrl}`;
        
        audio.src = audioUrl;
        
        const savedPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (savedPosition) {
          const position = parseFloat(savedPosition);
          if (!isNaN(position) && position > 0) {
            audio.currentTime = position;
          }
        }
      }

      await audio.play();
      audio.playbackRate = playbackSpeed;
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: "Failed to play audio",
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
          const audioUrl = audioData.audioUrl.startsWith('http')
            ? audioData.audioUrl
            : `${window.location.origin}${audioData.audioUrl}`;
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
  };
}
