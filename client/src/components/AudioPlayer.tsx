import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  Volume2,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  List,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAudio } from "../hooks/use-audio";
import { useUser } from "../hooks/use-user";
import { cn } from "@/lib/utils";

export default function AudioPlayer() {
  const {
    audioData,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    setPosition,
    setVolume: setAudioVolume,
    playlist,
    currentIndex,
    setCurrentIndex,
    setPlaylist,
    playbackSpeed,
    setPlaybackSpeed,
    fastForward,
    rewind,
    play,
    next,
    previous,
    removeFromPlaylist,
  } = useAudio();

  const { user } = useUser();

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return null;

  return (
    <div className="w-full h-24 bg-black border-t border-gray-800 fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out">
      <div className="h-full mx-auto px-4 flex items-center justify-between gap-4 max-w-screen-2xl">
        {/* Left section - Podcast Info */}
        <div className="flex items-center gap-4 min-w-[200px] max-w-[300px]">
          {audioData ? (
            <>
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  audioData.coverImage ? "" : "bg-[#4CAF50]/20"
                }`}
              >
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
            </>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <Volume2 className="h-5 w-5" />
              <span>No audio selected</span>
            </div>
          )}
        </div>

        {/* Center section - Controls */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-[600px]">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className={`text-white hover:text-white ${
                currentIndex > 0
                  ? "hover:bg-[#4CAF50]/20"
                  : "opacity-50 cursor-not-allowed"
              }`}
              onClick={previous}
              disabled={!audioData || currentIndex <= 0}
              title={`Previous track ${currentIndex > 0 ? `(${playlist[currentIndex - 1]?.title})` : ""}`}
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:text-white hover:bg-[#4CAF50]/20"
              onClick={rewind}
              disabled={!audioData}
              title="Rewind 10 seconds"
            >
              <Rewind className="h-5 w-5" />
            </Button>

            <Button
              onClick={togglePlay}
              variant="outline"
              size="icon"
              disabled={!audioData}
              className={`h-10 w-10 rounded-full border-none text-white ${
                audioData
                  ? "bg-[#4CAF50] hover:bg-[#45a049] cursor-pointer"
                  : "bg-gray-600 cursor-not-allowed"
              }`}
              title={isPlaying ? "Pause" : "Play"}
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
              disabled={!audioData}
              title="Fast forward 10 seconds"
            >
              <FastForward className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={`text-white hover:text-white ${
                currentIndex < playlist.length - 1
                  ? "hover:bg-[#4CAF50]/20"
                  : "opacity-50 cursor-not-allowed"
              }`}
              onClick={next}
              disabled={!audioData || currentIndex >= playlist.length - 1}
              title={`Next track ${currentIndex < playlist.length - 1 ? `(${playlist[currentIndex + 1]?.title})` : ""}`}
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            <Select
              value={playbackSpeed.toString()}
              onValueChange={(value) => setPlaybackSpeed(parseFloat(value))}
              disabled={!audioData}
            >
              <SelectTrigger
                className={`w-[80px] bg-transparent text-white ${
                  audioData ? "border-[#4CAF50]" : "border-gray-600"
                }`}
              >
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
              {audioData ? formatTime(currentTime) : "--:--"}
            </span>
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              disabled={!audioData}
              onValueChange={([value]) => setPosition(value)}
              className={`flex-1 ${!audioData ? "opacity-50" : ""}`}
            />
            <span className="text-sm text-white w-12">
              {audioData ? formatTime(duration) : "--:--"}
            </span>
          </div>
        </div>

        {/* Right section - Volume & Playlist */}
        <div className="flex items-center gap-4 min-w-[300px]">
          <Slider
            defaultValue={[100]}
            max={100}
            step={1}
            disabled={!audioData}
            onValueChange={([value]) => setAudioVolume(value)}
            className={`w-24 ${!audioData ? "opacity-50" : ""}`}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="ml-2">
                <List className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <ScrollArea className="h-80">
                <div className="space-y-1 p-2">
                  {playlist && playlist.length > 0 ? (
                    playlist.map((podcast, index) => (
                      <div
                        key={podcast.id}
                        className={`flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer ${
                          currentIndex === index ? "bg-accent" : ""
                        }`}
                        onClick={() => {
                          setCurrentIndex(index);
                          play(podcast);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {podcast.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {podcast.description}
                          </p>
                        </div>
                        {currentIndex === index && (
                          <div className="w-4 h-4">
                            <span className="w-2 h-2 bg-green-500 rounded-full block" />
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-sm text-center text-muted-foreground">
                      No audio in playlist
                    </div>
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
