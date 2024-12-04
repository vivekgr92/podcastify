import { useState, useRef, useEffect } from "react";
import type { Podcast } from "@db/schema";

export function useAudio() {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyzerRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audioRef.current);
      const analyzer = audioContext.createAnalyser();
      
      source.connect(analyzer);
      analyzer.connect(audioContext.destination);
      
      analyzer.fftSize = 256;
      analyzerRef.current = analyzer;
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

  const play = (podcast: Podcast) => {
    if (audioRef.current) {
      audioRef.current.src = podcast.audioUrl;
      audioRef.current.play();
      setAudioData(podcast);
      setIsPlaying(true);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
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

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    canvasRef,
    play,
    togglePlay,
    setPosition,
  };
}
