import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipBack, SkipForward, Volume2, Volume1, VolumeX } from "lucide-react";
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

  const [volume, setVolume] = useState(100);
  const [prevVolume, setPrevVolume] = useState(100);

  if (!audioData) return null;

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume);
    }
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-b from-black/50 to-black border-t border-white/10 backdrop-blur-lg">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 right-0 h-1"
      />
      <div className="max-w-7xl mx-auto flex items-center gap-4 p-4">
        <div className="flex items-center gap-4 w-[30%]">
          {audioData.coverImage ? (
            <img
              src={audioData.coverImage}
              alt={audioData.title}
              className="w-14 h-14 rounded-md object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-md bg-white/5 flex items-center justify-center">
              <Volume2 size={24} className="text-white/60" />
            </div>
          )}
          
          <div className="min-w-0">
            <h3 className="font-medium text-white truncate">{audioData.title}</h3>
            <p className="text-sm text-white/60 truncate">{audioData.description}</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="flex items-center gap-6">
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              <SkipBack size={20} />
            </Button>
            
            <Button 
              onClick={togglePlay} 
              size="icon"
              className="bg-white hover:bg-white/90 text-black rounded-full h-10 w-10 flex items-center justify-center"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              <SkipForward size={20} />
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full max-w-2xl">
            <span className="text-xs text-white/60 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            
            <Slider
              value={[currentTime]}
              max={duration}
              step={1}
              onValueChange={([value]) => setPosition(value)}
              className="flex-1"
            />
            
            <span className="text-xs text-white/60 w-12">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-[30%] justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="text-white/60 hover:text-white hover:bg-white/10"
          >
            <VolumeIcon size={20} />
          </Button>
          <Slider
            value={[volume]}
            max={100}
            step={1}
            onValueChange={([value]) => setVolume(value)}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
