import { useState, useRef, useEffect } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

export function useAudio() {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const { toast } = useToast();
  
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyzerRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audioRef.current);
        const analyzer = audioContext.createAnalyser();
        
        source.connect(analyzer);
        analyzer.connect(audioContext.destination);
        
        analyzer.fftSize = 256;
        analyzerRef.current = analyzer;

        // Set initial volume
        audioRef.current.volume = 1.0;
      } catch (error) {
        console.error('Error setting up audio context:', error);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current || !canvasRef.current || !analyzerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const analyzer = analyzerRef.current;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function animate() {
      animationRef.current = requestAnimationFrame(animate);
      analyzer.getByteFrequencyData(dataArray);

      ctx.fillStyle = "rgb(23, 23, 23)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        ctx.fillStyle = `hsl(280, 100%, ${50 + (barHeight / 2)}%)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    }

    animate();
  }, [isPlaying]);

  const play = async (podcast: Podcast) => {
    if (!audioRef.current) return;

    try {
      const isSamePodcast = audioData?.id === podcast.id;
      const currentPosition = isSamePodcast ? audioRef.current.currentTime : 0;

      // Add event listeners for loading
      audioRef.current.onloadedmetadata = () => {
        setDuration(audioRef.current?.duration || 0);
        // Set the current position if it's the same podcast
        if (isSamePodcast) {
          audioRef.current!.currentTime = currentPosition;
        }
      };
      
      audioRef.current.ontimeupdate = () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      };

      const audioSrc = podcast.audioUrl.startsWith('http') 
        ? podcast.audioUrl 
        : `${window.location.origin}${podcast.audioUrl}`;
      
      console.log('Attempting to play audio from:', audioSrc);
      
      // Add error handler for loading errors
      audioRef.current.onerror = (e) => {
        console.error('Audio loading error:', e);
        if (audioRef.current) {
          toast({
            title: "Error",
            description: `Failed to load audio file: ${audioRef.current.error?.message || 'Unknown error'}`,
            variant: "destructive",
          });
        }
        setIsPlaying(false);
        setAudioData(null);
      };
      
      setAudioData(podcast);
      setIsPlaying(true);
      
      if (!isSamePodcast) {
        audioRef.current.src = audioSrc;
        audioRef.current.load(); // Explicitly load the audio
      }
      
      await audioRef.current.play();
      setIsPlaying(true);
      
      console.log('Audio started playing:', {
        src: audioSrc,
        podcast,
        isPlaying: true
      });
      console.log('Audio playback started successfully');
    } catch (error: any) {
      console.error('Error playing audio:', error.message);
      toast({
        title: "Error",
        description: `Failed to play audio: ${error.message}`,
        variant: "destructive",
      });
      // Reset the audio state
      setIsPlaying(false);
      setAudioData(null);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // Resume from current position
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
