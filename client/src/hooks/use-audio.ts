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
    if (!audioRef.current) {
      const audio = new Audio();
      audioRef.current = audio;
      console.log('Audio element created');
    }

    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
        audioRef.current = null;
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

      // Update audio data first
      setAudioData(podcast);
      setIsPlaying(true);

      // Save current position and pause before switching
      if (audioData && audioData.id !== podcast.id) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        audio.pause();
      }

      console.log('Audio state updated:', {
        podcast,
        isAudioSet: true,
        isPlaying: true
      });
      
      // Construct the audio URL
      const baseUrl = window.location.origin;
      let audioUrl = podcast.audioUrl;
      if (!audioUrl.startsWith('http')) {
        audioUrl = `${baseUrl}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
      }
      
      console.log('Audio URL:', audioUrl);

      // Clean up existing event listeners
      audio.removeEventListener('canplay', () => {});
      audio.removeEventListener('error', () => {});
      
      // Set up new event listeners
      const handleCanPlay = () => {
        console.log('Audio can play');
        audio.play()
          .then(() => {
            audio.playbackRate = playbackSpeed;
            setIsPlaying(true);
            console.log('Audio playback started successfully');
          })
          .catch(err => {
            console.error('Playback failed after canplay:', err);
            toast({
              title: "Error",
              description: "Failed to start playback. Please try again.",
              variant: "destructive",
            });
          });
      };

      const handleError = (e: Event) => {
        console.error('Audio error:', {
          error: e,
          currentSrc: audio.currentSrc,
          readyState: audio.readyState,
          networkState: audio.networkState,
          errorCode: audio.error?.code,
          errorMessage: audio.error?.message
        });
        toast({
          title: "Error",
          description: `Failed to load audio: ${audio.error?.message || 'Unknown error'}`,
          variant: "destructive",
        });
      };

      // Add event listeners
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleError);

      // Set source and load
      audio.src = audioUrl;
      audio.load();

      // Save last played podcast
      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
    } catch (error) {
      console.error('Error in play function:', error);
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