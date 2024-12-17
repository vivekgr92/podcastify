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
    
    // Try to restore last played podcast
    const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
    if (lastPlayedPodcast) {
      try {
        const podcast = JSON.parse(lastPlayedPodcast);
        setAudioData(podcast);
        
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (lastPosition) {
          audio.currentTime = parseFloat(lastPosition);
        }
        
        const baseUrl = window.location.origin;
        const audioUrl = podcast.audioUrl.startsWith('http') 
          ? podcast.audioUrl 
          : `${baseUrl}${podcast.audioUrl}`;
        
        audio.src = audioUrl;
        audio.load();
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
  }, []);

  const constructAudioUrl = useCallback((url: string): string => {
    const baseUrl = window.location.origin;
    return url.startsWith('http') ? url : `${baseUrl}${url}`;
  }, []);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      // Ensure we have an audio instance
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;

      // Handle switching between podcasts
      if (audioData?.id !== podcast.id) {
        // Save current position of the previous podcast if exists
        if (audioData) {
          localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        }

        // Stop current playback before switching
        audio.pause();
        setIsPlaying(false);

        // Clear current audio state
        setCurrentTime(0);
        setDuration(0);

        const audioUrl = constructAudioUrl(podcast.audioUrl);
        
        // Validate audio file accessibility
        try {
          const response = await fetch(audioUrl, { method: 'HEAD' });
          if (!response.ok) {
            throw new Error(`Audio file not accessible: ${response.status}`);
          }
        } catch (error) {
          throw new Error('Could not access audio file. Please check the URL.');
        }
        
        // Load new audio
        audio.src = audioUrl;
        audio.load();

        // Wait for audio to be ready
        await new Promise<void>((resolve, reject) => {
          const handleCanPlay = () => {
            cleanup();
            resolve();
          };

          const handleError = () => {
            cleanup();
            reject(new Error(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`));
          };

          const cleanup = () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('error', handleError);
          };

          audio.addEventListener('canplay', handleCanPlay);
          audio.addEventListener('error', handleError);
        });

        // Update state and store current podcast
        setAudioData(podcast);
        localStorage.setItem('last-played-podcast', JSON.stringify(podcast));

        // Restore last position if available
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (lastPosition) {
          const position = parseFloat(lastPosition);
          if (!isNaN(position) && position > 0) {
            audio.currentTime = position;
          }
        }
      }

      // Play the audio
      await audio.play();
      audio.playbackRate = playbackSpeed;
      setIsPlaying(true);

    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [audioData, playbackSpeed, toast, constructAudioUrl]);

  const togglePlay = useCallback(async () => {
    try {
      const audio = audioRef.current;
      if (!audio || !audioData) {
        throw new Error('No audio loaded');
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        if (audioData?.id) {
          localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        }
      } else {
        const audioUrl = constructAudioUrl(audioData.audioUrl);
        
        // Only reload if the source has changed
        if (audio.src !== audioUrl) {
          audio.src = audioUrl;
          audio.load();
          
          // Wait for the audio to be ready
          await new Promise<void>((resolve, reject) => {
            const handleCanPlay = () => {
              cleanup();
              resolve();
            };
            
            const handleError = () => {
              cleanup();
              reject(new Error(`Failed to load audio: ${audio.error?.message || 'Unknown error'}`));
            };
            
            const cleanup = () => {
              audio.removeEventListener('canplay', handleCanPlay);
              audio.removeEventListener('error', handleError);
            };
            
            audio.addEventListener('canplay', handleCanPlay);
            audio.addEventListener('error', handleError);
          });

          // Restore last position if available
          if (audioData?.id) {
            const lastPosition = localStorage.getItem(`podcast-${audioData.id}-position`);
            if (lastPosition) {
              audio.currentTime = parseFloat(lastPosition);
            }
          }
        }

        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      setIsPlaying(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, playbackSpeed, toast, constructAudioUrl]);

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
