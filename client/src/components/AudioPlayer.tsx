import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useAudio } from "../hooks/use-audio";

export default function AudioPlayer() {
  const {
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    setPosition,
    audioData,
    canvasRef,
  } = useAudio();

  if (!audioData) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        {audioData.coverImage ? (
          <img
            src={audioData.coverImage}
            alt={audioData.title}
            className="w-12 h-12 rounded"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
            <Volume2 size={20} />
          </div>
        )}
        
        <div className="flex-1">
          <h3 className="font-medium">{audioData.title}</h3>
          <p className="text-sm text-muted-foreground">{audioData.description}</p>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <SkipBack size={20} />
          </Button>
          
          <Button onClick={togglePlay} size="icon">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </Button>
          
          <Button variant="ghost" size="icon">
            <SkipForward size={20} />
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          
          <Slider
            value={[currentTime]}
            max={duration}
            step={1}
            onValueChange={([value]) => setPosition(value)}
            className="flex-1"
          />
          
          <span className="text-sm text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 size={20} />
          <Slider
            defaultValue={[100]}
            max={100}
            step={1}
            className="w-24"
          />
        </div>

        <canvas
          ref={canvasRef}
          className="absolute bottom-full left-0 right-0 h-8"
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
