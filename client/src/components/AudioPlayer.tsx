import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Volume2,
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
import { useUser } from "../hooks/use-user";

export default function AudioPlayer() {
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

  const { user } = useUser();

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleDownload = () => {
    if (!audioData) return;
    const link = document.createElement("a");
    const baseUrl = window.location.origin;
    const audioUrl = audioData.audioUrl.startsWith("http")
      ? audioData.audioUrl
      : `${baseUrl}${audioData.audioUrl}`;
    link.href = audioUrl;
    link.download = `${audioData.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Only render if there's audio data and user is authenticated
  if (!user || !audioData) {
    return null;
  }

  return (
    <div className="w-full h-24 bg-black border-t border-gray-800 fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out">
      <div className="h-full mx-auto px-4 flex items-center justify-between gap-4 max-w-screen-2xl">
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

        <div className="flex items-center gap-4 min-w-[150px]">
          <Slider
            defaultValue={[100]}
            max={100}
            step={1}
            onValueChange={([value]) => setAudioVolume(value)}
            className="w-24"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="text-white hover:text-white hover:bg-[#4CAF50]/20"
            title="Download audio"
          >
            <Download className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
