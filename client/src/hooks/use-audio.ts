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

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    // Restore last played podcast
    const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
    if (lastPlayedPodcast) {
      try {
        const podcast = JSON.parse(lastPlayedPodcast);
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        
        if (podcast.audioUrl) {
          const baseUrl = window.location.origin;
          const audioUrl = podcast.audioUrl.startsWith('http') 
            ? podcast.audioUrl 
            : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;

          audio.src = audioUrl;
          
          const handleError = (error: Event) => {
            console.error('Error loading audio:', error);
            toast({
              title: "Error",
              description: "Failed to restore last played podcast",
              variant: "destructive",
            });
            localStorage.removeItem('last-played-podcast');
            audio.removeEventListener('error', handleError);
          };
          
          audio.addEventListener('error', handleError);
          
          if (lastPosition) {
            audio.currentTime = parseFloat(lastPosition);
          }
          
          audio.addEventListener('loadedmetadata', () => {
            setAudioData(podcast);
            setDuration(audio.duration);
            audio.removeEventListener('error', handleError);
          });

          audio.load();
        }
      } catch (error) {
        console.error('Error restoring last played podcast:', error);
        localStorage.removeItem('last-played-podcast');
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, [toast]);

  const play = useCallback(async (podcast: Podcast) => {
    try {
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

      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;

      console.log('Attempting to play audio from URL:', audioUrl);

      // Update audio data and UI state
      setAudioData(podcast);
      audio.src = audioUrl;

      // Set up audio initialization with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          await new Promise((resolve, reject) => {
            const loadTimeout = setTimeout(() => {
              reject(new Error('Audio load timeout'));
            }, 5000);

            const handleCanPlay = () => {
              clearTimeout(loadTimeout);
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleError);
              resolve(true);
            };

            const handleError = (e: Event) => {
              clearTimeout(loadTimeout);
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleError);
              const audioError = audio.error;
              reject(new Error(audioError?.message || 'Audio load failed'));
            };

            audio.addEventListener('canplay', handleCanPlay);
            audio.addEventListener('error', handleError);
            audio.load();
          });

          await audio.play();
          audio.playbackRate = playbackSpeed;
          setIsPlaying(true);
          localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
          break;
        } catch (error) {
          retryCount++;
          console.error(`Audio load attempt ${retryCount} failed:`, error);
          if (retryCount === maxRetries) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio. Please try again.",
        variant: "destructive",
      });
      setIsPlaying(false);
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
        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle playback",
        variant: "destructive",
      });
      setIsPlaying(false);
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  // Handle audio events
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
      const error = audio.error;
      console.error('Audio error:', {
        error,
        code: error?.code,
        message: error?.message,
        currentSrc: audio.currentSrc
      });
      toast({
        title: "Playback Error",
        description: error?.message || "An error occurred during playback",
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
  }, [audioData, playbackSpeed, toast]);

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
