import { useState, useRef, useEffect, useCallback } from "react";
import type { Podcast } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

interface AudioHookReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioData: Podcast | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playbackSpeed: number;
  play: (podcast: Podcast) => void;
  togglePlay: () => void;
  setPosition: (time: number) => void;
  setVolume: (value: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  fastForward: () => void;
  rewind: () => void;
}

export function useAudio(): AudioHookReturn {
  const [audioData, setAudioData] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  // Load last played audio and position on mount
  useEffect(() => {
    const loadLastPlayed = async () => {
      try {
        // Get last played podcast data
        const lastPlayedPodcast = localStorage.getItem('last-played-podcast');
        if (!lastPlayedPodcast) return;

        const podcast = JSON.parse(lastPlayedPodcast);
        setAudioData(podcast);
        
        // Create new audio element if needed
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        
        // Set up audio source
        const audioUrl = podcast.audioUrl.startsWith('http')
          ? podcast.audioUrl
          : `${window.location.origin}${podcast.audioUrl}`;
        
        // Only set src if it's different
        if (audio.src !== audioUrl) {
          audio.src = audioUrl;
          
          // Load saved position
          const savedPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
          if (savedPosition) {
            const position = parseFloat(savedPosition);
            if (!isNaN(position) && position > 0) {
              // Wait for metadata to load before setting position
              const handleMetadata = () => {
                const validPosition = Math.min(position, audio.duration);
                audio.currentTime = validPosition;
                setCurrentTime(validPosition);
                
                // Update progress on server
                fetch('/api/progress', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    podcastId: podcast.id,
                    position: validPosition,
                    completed: false,
                  }),
                }).catch(err => console.error('Failed to update progress:', err));
              };

              if (audio.readyState >= 1) {
                handleMetadata();
              } else {
                audio.addEventListener('loadedmetadata', handleMetadata, { once: true });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading last played podcast:', error);
      }
    };
    
    loadLastPlayed();

    // Save position and cleanup on unmount
    const savePosition = () => {
      const audio = audioRef.current;
      if (audio && audioData) {
        const currentPosition = audio.currentTime;
        localStorage.setItem(`podcast-${audioData.id}-position`, currentPosition.toString());
        localStorage.setItem('last-played-podcast', JSON.stringify(audioData));
      }
    };

    // Add beforeunload event listener to save position when closing tab
    window.addEventListener('beforeunload', savePosition);

    // Cleanup
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        savePosition();
      }
      window.removeEventListener('beforeunload', savePosition);
    };
  }, [audioData]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = async () => {
      setCurrentTime(audio.currentTime);
      if (audioData) {
        // Only save position every second to reduce storage writes
        if (Math.floor(audio.currentTime) !== Math.floor(currentTime)) {
          localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
          localStorage.setItem('last-played-podcast', JSON.stringify(audioData));
          
          // Update progress on server every 5 seconds
          if (Math.floor(audio.currentTime) % 5 === 0) {
            try {
              await fetch('/api/progress', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  podcastId: audioData.id,
                  position: audio.currentTime,
                  completed: audio.currentTime >= audio.duration - 1,
                }),
              });
            } catch (error) {
              console.error('Failed to update progress on server:', error);
            }
          }
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      // Restore playback speed when loading new audio
      audio.playbackRate = playbackSpeed;
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (audioData) {
        localStorage.removeItem(`podcast-${audioData.id}-position`);
      }
    };

    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      toast({
        title: "Error",
        description: "Failed to load audio",
        variant: "destructive",
      });
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioData, toast, playbackSpeed]);

  const play = useCallback(async (podcast: Podcast) => {
    try {
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }
      
      // Save current position before switching
      if (audioData && audioData.id !== podcast.id) {
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
        audio.pause();
      }

      // Always update audio data first to ensure UI updates
      setAudioData(podcast);
      
      // Set up the audio source if it's a new podcast or source has changed
      const audioUrl = podcast.audioUrl.startsWith('http')
        ? podcast.audioUrl
        : `${window.location.origin}${podcast.audioUrl}`;
      
      // If it's a new podcast or the source has changed
      if (!audio.src || audio.src !== audioUrl) {
        audio.src = audioUrl;
        
        // Load saved position
        const savedPosition = localStorage.getItem(`podcast-${podcast.id}-position`);
        if (savedPosition) {
          const position = parseFloat(savedPosition);
          const handleMetadata = () => {
            if (!isNaN(position) && position > 0) {
              const validPosition = Math.min(position, audio.duration);
              audio.currentTime = validPosition;
              setCurrentTime(validPosition);
            }
          };

          if (audio.readyState >= 1) {
            handleMetadata();
          } else {
            audio.addEventListener('loadedmetadata', handleMetadata, { once: true });
          }
        }
      }

      localStorage.setItem('last-played-podcast', JSON.stringify(podcast));
      await audio.play();
      audio.playbackRate = playbackSpeed;
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Error",
        description: "Failed to play audio",
        variant: "destructive",
      });
    }
  }, [playbackSpeed, toast]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        localStorage.setItem(`podcast-${audioData.id}-position`, audio.currentTime.toString());
      } else {
        if (!audio.src) {
          const audioUrl = audioData.audioUrl.startsWith('http')
            ? audioData.audioUrl
            : `${window.location.origin}${audioData.audioUrl}`;
          audio.src = audioUrl;
        }

        await audio.play();
        audio.playbackRate = playbackSpeed;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      toast({
        title: "Error",
        description: "Failed to toggle playback",
        variant: "destructive",
      });
    }
  }, [audioData, isPlaying, playbackSpeed, toast]);

  const setPosition = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !audioData) return;

    audio.currentTime = time;
    setCurrentTime(time);
    localStorage.setItem(`podcast-${audioData.id}-position`, time.toString());
  }, [audioData]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value / 100;
    }
  }, []);

  const changePlaybackSpeed = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  }, []);

  const fastForward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.min(audio.currentTime + 10, audio.duration);
      setPosition(newTime);
    }
  }, [setPosition]);

  const rewind = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(audio.currentTime - 10, 0);
      setPosition(newTime);
    }
  }, [setPosition]);

  return {
    isPlaying,
    currentTime,
    duration,
    audioData,
    canvasRef,
    playbackSpeed,
    play,
    togglePlay,
    setPosition,
    setVolume,
    setPlaybackSpeed: changePlaybackSpeed,
    fastForward,
    rewind,
  };
}
