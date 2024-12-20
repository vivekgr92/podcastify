import React from "react";
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
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    setPosition,
    setVolume: setAudioVolume,
    audioData,
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

  // Handle play/pause toggle with proper state management
  const handlePlayPause = async () => {
    if (!audioData) return;

    try {
      await togglePlay();
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  // Only render if we have a user
  if (!user) {
    return null;
  }

  return (
    <div className={`w-full h-24 bg-black border-t border-gray-800 fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${!audioData ? 'translate-y-full' : ''}`}>
      <div className="h-full mx-auto px-4 flex items-center justify-between gap-4 max-w-screen-2xl">
        {/* Left section - Podcast Info */}
        <div className="flex items-center gap-4 min-w-[200px] max-w-[300px]">
          {audioData ? (
            <>
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  audioData.coverImage ? '' : 'bg-[#4CAF50]/20'
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
                  ? 'hover:bg-[#4CAF50]/20'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={previous}
              disabled={!audioData || currentIndex <= 0}
              title={`Previous track ${currentIndex > 0 ? `(${playlist[currentIndex - 1]?.title})` : ''}`}
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
              onClick={handlePlayPause}
              variant="outline"
              size="icon"
              disabled={!audioData}
              className={`h-10 w-10 rounded-full border-none text-white ${
                audioData
                  ? 'bg-[#4CAF50] hover:bg-[#45a049] cursor-pointer'
                  : 'bg-gray-600 cursor-not-allowed'
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
                  ? 'hover:bg-[#4CAF50]/20'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={next}
              disabled={!audioData || currentIndex >= playlist.length - 1}
              title={`Next track ${currentIndex < playlist.length - 1 ? `(${playlist[currentIndex + 1]?.title})` : ''}`}
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            <Select
              value={playbackSpeed.toString()}
              onValueChange={(value) => setPlaybackSpeed(parseFloat(value))}
              disabled={!audioData}
            >
              <SelectTrigger className={`w-[80px] bg-transparent text-white ${
                audioData ? 'border-[#4CAF50]' : 'border-gray-600'
              }`}>
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
              onValueChange={([value]) => {
                if (audioData) {
                  setPosition(value);
                }
              }}
              className={`flex-1 ${!audioData ? 'opacity-50' : ''}`}
            />
            <span className="text-sm text-white w-12">
              {audioData ? formatTime(duration) : "--:--"}
            </span>
          </div>
        </div>

        {/* Right section - Volume & Playlist */}
        <div className="flex items-center gap-4 min-w-[150px]">
          <Slider
            defaultValue={[100]}
            max={100}
            step={1}
            disabled={!audioData}
            onValueChange={([value]) => setAudioVolume(value)}
            className={`w-24 ${!audioData ? 'opacity-50' : ''}`}
          />
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!audioData}
                  className={`text-white hover:text-white relative ${
                    audioData ? 'hover:bg-[#4CAF50]/20' : 'opacity-50 cursor-not-allowed'
                  }`}
                  title={`Playlist (${playlist.length} items)`}
                >
                  <List className="h-5 w-5" />
                  {playlist.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#4CAF50] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {playlist.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0 bg-black border-gray-800">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-white">Current Playlist</h4>
                    <span className="text-xs text-gray-400">{playlist.length} tracks</span>
                  </div>
                  <ScrollArea className="h-[400px] pr-4">
                    {playlist.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-[200px] text-center">
                        <Volume2 className="h-8 w-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-400">No items in playlist</p>
                        <p className="text-xs text-gray-500 mt-1">Add tracks from your library</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {playlist.map((item, index) => (
                          <div
                            key={item.id}
                            className={cn(
                              "group flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                              index === currentIndex
                                ? "bg-[#4CAF50]/20"
                                : "hover:bg-gray-800/50"
                            )}
                          >
                            <div className="flex-shrink-0 text-sm text-gray-400 w-6 text-center">
                              {index + 1}
                            </div>
                            <button
                              className="flex-1 flex items-center gap-3 min-w-0 text-left"
                              onClick={() => play(item)}
                            >
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                item.coverImage ? '' : 'bg-[#4CAF50]/20'
                              }`}>
                                {item.coverImage ? (
                                  <img
                                    src={item.coverImage}
                                    alt={item.title}
                                    className="w-full h-full rounded-lg object-cover"
                                  />
                                ) : (
                                  <Volume2 className="h-5 w-5 text-white" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                  {item.title}
                                </p>
                                <p className="text-xs text-gray-400 truncate">
                                  {item.description}
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {index !== 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#4CAF50]/20"
                                  onClick={() => {
                                    const newPlaylist = [...playlist];
                                    [newPlaylist[index], newPlaylist[index - 1]] =
                                      [newPlaylist[index - 1], newPlaylist[index]];
                                    if (index === currentIndex) {
                                      setCurrentIndex(index - 1);
                                    } else if (index - 1 === currentIndex) {
                                      setCurrentIndex(index);
                                    }
                                    setPlaylist(newPlaylist);
                                  }}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                  <span className="sr-only">Move up</span>
                                </Button>
                              )}
                              {index !== playlist.length - 1 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#4CAF50]/20"
                                  onClick={() => {
                                    const newPlaylist = [...playlist];
                                    [newPlaylist[index], newPlaylist[index + 1]] =
                                      [newPlaylist[index + 1], newPlaylist[index]];
                                    if (index === currentIndex) {
                                      setCurrentIndex(index + 1);
                                    } else if (index + 1 === currentIndex) {
                                      setCurrentIndex(index);
                                    }
                                    setPlaylist(newPlaylist);
                                  }}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                  <span className="sr-only">Move down</span>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-white hover:bg-red-500/20"
                                onClick={() => removeFromPlaylist(item.id)}
                              >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Remove from playlist</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  );
}