import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, Volume1, VolumeX, Download, Loader2 } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
      setAudioVolume(0);
    } else {
      const volumeToRestore = prevVolume || 100;
      setVolume(volumeToRestore);
      setAudioVolume(volumeToRestore);
    }
  };

  useEffect(() => {
    if (audioData) {
      setVolume(prevVolume || 100);
      setAudioVolume(prevVolume || 100);
      setIsLoading(false);
    }
  }, [audioData, prevVolume]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!audioData) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-[#4CAF50] shadow-lg z-[100]">
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
                {audioData.title}
              </h3>
              <p className="text-sm text-gray-400 truncate">
                {audioData.description}
              </p>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[600px]">
            <div className="flex items-center gap-4">
              <Button 
                onClick={togglePlay}
                variant="outline"
                size="icon"
                disabled={isLoading}
                className="h-10 w-10 rounded-full bg-[#4CAF50] hover:bg-[#45a049] border-none text-white"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
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

          {/* Download Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const link = document.createElement('a');
              const baseUrl = window.location.origin;
              const audioUrl = audioData.audioUrl.startsWith('http') 
                ? audioData.audioUrl 
                : `${baseUrl}${audioData.audioUrl}`;
              link.href = audioUrl;
              link.download = `${audioData.title}.mp3`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="text-white hover:text-white hover:bg-[#4CAF50]/20 ml-4"
            title="Download audio"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}