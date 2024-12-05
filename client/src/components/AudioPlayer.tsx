import { useState } from "react";
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
    setVolume: setAudioVolume,
    audioData,
    canvasRef,
  } = useAudio();

  const [volume, setVolume] = useState(100);
  const [prevVolume, setPrevVolume] = useState(100);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
      setAudioVolume(0);
    } else {
      setVolume(prevVolume);
      setAudioVolume(prevVolume);
    }
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t-2 border-[#4CAF50] shadow-lg z-50">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 right-0 h-1 bg-[#4CAF50]/20"
      />
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Track Info */}
          <div className="flex items-center gap-4 min-w-[200px] max-w-[300px]">
            <div className="w-12 h-12 bg-[#4CAF50]/20 rounded-lg flex items-center justify-center">
              {audioData?.coverImage ? (
                <img
                  src={audioData.coverImage}
                  alt={audioData.title}
                  className="w-full h-full rounded-lg object-cover"
                />
              ) : (
                <Volume2 className="h-6 w-6 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate text-white">
                {audioData?.title || "No track selected"}
              </h3>
              <p className="text-sm text-gray-400 truncate">
                {audioData?.description || "Select a podcast to play"}
              </p>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[600px]">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:text-white hover:bg-[#4CAF50]/20"
                disabled={!audioData}
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              
              <Button 
                onClick={togglePlay}
                variant="outline"
                size="icon"
                disabled={!audioData}
                className="h-10 w-10 rounded-full bg-[#4CAF50] hover:bg-[#45a049] border-none text-white"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon"
                className="text-white hover:text-white hover:bg-[#4CAF50]/20"
                disabled={!audioData}
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full">
              <span className="text-sm text-white w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={1}
                onValueChange={([value]) => setPosition(value)}
                className="flex-1"
                disabled={!audioData}
              />
              <span className="text-sm text-white w-12">
                {formatTime(duration || 0)}
              </span>
            </div>
          </div>

          {/* Volume Controls */}
          <div className="flex items-center gap-2 min-w-[150px]">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="text-white hover:text-white hover:bg-[#4CAF50]/20"
            >
              <VolumeIcon className="h-5 w-5" />
            </Button>
            <Slider
              value={[volume]}
              max={100}
              step={1}
              onValueChange={([value]) => {
                setVolume(value);
                setAudioVolume(value);
              }}
              className="w-[100px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
