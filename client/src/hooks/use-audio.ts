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
    
    // Try to restore last played podcast
    const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
    if (lastPlayedPodcast) {
      try {
        const podcast = JSON.parse(lastPlayedPodcast);
        setAudioData(podcast);
        // Restore the last position if available
        const lastPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (lastPosition) {
          audio.currentTime = parseFloat(lastPosition);
        }
      } catch (error) {
        console.error('Error restoring last played podcast:', error);
        localStorage.removeItem('last-played-podcast');
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