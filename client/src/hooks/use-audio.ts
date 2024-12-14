import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Podcast {
  id: number;
  title: string;
  description: string;
  audioUrl: string;
  coverImage?: string;
}

export function useAudio() {
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for audio elements
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef(0);
  const pausedAtRef = useRef(0);
  const animationFrameRef = useRef<number>();

  // Create or get AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Clean up function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    setIsPlaying(false);
    pausedAtRef.current = 0;
  }, []);

  // Start playback
  const startPlayback = useCallback(async (offset = 0) => {
    if (!audioBufferRef.current) return;

    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    cleanup();

    const sourceNode = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    sourceNode.buffer = audioBufferRef.current;
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    sourceNodeRef.current = sourceNode;
    gainNodeRef.current = gainNode;

    sourceNode.start(0, offset);
    startTimeRef.current = audioContext.currentTime - offset;
    setIsPlaying(true);

    const updateTime = () => {
      if (!isPlaying) return;
      
      const newTime = audioContext.currentTime - startTimeRef.current;
      setCurrentTime(newTime);
      
      if (newTime < audioBufferRef.current!.duration) {
        animationFrameRef.current = requestAnimationFrame(updateTime);
      } else {
        cleanup();
        setCurrentTime(0);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateTime);

    sourceNode.onended = () => {
      cleanup();
      setCurrentTime(0);
    };
  }, [cleanup, getAudioContext, isPlaying]);

  // Load and play audio
  const play = useCallback(async (podcast: Podcast) => {
    try {
      setIsLoading(true);
      cleanup();

      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const baseUrl = window.location.origin;
      const audioUrl = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${baseUrl}${podcast.audioUrl.startsWith('/') ? '' : '/'}${podcast.audioUrl}`;

      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch audio file');
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      setAudioData(podcast);

      await startPlayback(0);
    } catch (error) {
      console.error('Error loading audio:', error);
      toast({
        title: "Error",
        description: "Failed to load audio file. Please try again.",
        variant: "destructive",
      });
      cleanup();
    } finally {
      setIsLoading(false);
    }
  }, [cleanup, getAudioContext, startPlayback, toast]);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    const audioContext = getAudioContext();
    
    if (isPlaying) {
      audioContext.suspend();
      pausedAtRef.current = audioContext.currentTime - startTimeRef.current;
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else if (audioBufferRef.current) {
      await startPlayback(pausedAtRef.current);
    }
  }, [isPlaying, getAudioContext, startPlayback]);

  // Set playback position
  const setPosition = useCallback((time: number) => {
    if (!audioBufferRef.current || time < 0 || time > duration) return;
    startPlayback(time);
  }, [duration, startPlayback]);

  // Set volume
  const setVolume = useCallback((value: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = value / 100;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [cleanup]);

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    play,
    togglePlay,
    setPosition,
    setVolume,
    isLoading,
  };
}