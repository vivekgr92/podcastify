import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Download,
  Rewind,
  FastForward,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAudio } from "../hooks/use-audio";

export default function AudioPlayer() {
  const [volume, setVolume] = useState(100);
  const [prevVolume, setPrevVolume] = useState(100);
  
  const {
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    setPosition,
    setVolume: setAudioVolume,
    audioData,
    playbackSpeed,
    setPlaybackSpeed,
    fastForward,
    rewind,
  } = useAudio();

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const value = newVolume[0];
    setVolume(value);
    setAudioVolume(value);
  };

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

  const handleDownload = () => {
    if (!audioData) return;
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
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div className={`w-full h-24 bg-black border-t border-gray-800 fixed bottom-0 left-0 right-0 z-50 ${!audioData ? 'hidden' : ''}`}>
      <div className="h-full mx-auto px-4 flex items-center justify-between gap-4 max-w-screen-2xl">
        {audioData ? (
          <>
            <div className="flex items-center gap-4 min-w-[200px] max-w-[300px]">
              <div className="w-12 h-12 bg-[#4CAF50]/20 rounded-lg flex items-center justify-center">
                {audioData.coverImage ? (
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

            <div className="flex flex-col items-center gap-2 flex-1 max-w-[600px]">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-white hover:text-white hover:bg-[#4CAF50]/20"
                  onClick={rewind}
                  title="Rewind 10 seconds"
                >
                  <Rewind className="h-5 w-5" />
                </Button>
                
                <Button 
                  onClick={togglePlay}
                  variant="outline"
                  size="icon"
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
                  onClick={fastForward}
                  title="Fast forward 10 seconds"
                >
                  <FastForward className="h-5 w-5" />
                </Button>

                <Select
                  value={playbackSpeed.toString()}
                  onValueChange={(value) => setPlaybackSpeed(parseFloat(value))}
                >
                  <SelectTrigger className="w-[80px] bg-transparent text-white border-[#4CAF50]">
                    <SelectValue placeholder="1x">{playbackSpeed}x</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5x</SelectItem>
                    <SelectItem value="1">1x</SelectItem>
                    <SelectItem value="1.5">1.5x</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                  </SelectContent>
                </Select>
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
                onValueChange={handleVolumeChange}
                className="w-[100px]"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="text-white hover:text-white hover:bg-[#4CAF50]/20 ml-4"
              title="Download audio"
            >
              <Download className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a podcast to play
          </div>
        )}
      </div>
    </div>
  );
}
