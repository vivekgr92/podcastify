import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface ProgressData {
  progress: number;
}

export function useTTS() {
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupEventSource = () => {
      if (typeof window === 'undefined' || !window.EventSource) return;
      
      try {
        // Create the EventSource instance
        eventSource = new EventSource('/api/tts/progress');
        
        eventSource.onopen = () => {
          // Keep this client-side log for debugging purposes
          console.info('SSE connection opened');
        };
        
        eventSource.onmessage = (event: MessageEvent<string>) => {
          try {
            const data = JSON.parse(event.data) as ProgressData;
            if (typeof data.progress === 'number') {
              setProgress(Math.round(data.progress));
            }
          } catch (error) {
            console.error('Error parsing SSE progress data:', error instanceof Error ? error.message : String(error));
          }
        };

        eventSource.onerror = (event: Event) => {
          console.error('SSE connection error:', event instanceof Error ? event.message : 'Connection failed');
          // Check if connection is closed
          if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            setIsConverting(false);
            setProgress(0);
            eventSource.close();
          }
        };
      } catch (error) {
        console.error('Failed to setup SSE connection:', error instanceof Error ? error.message : String(error));
        setIsConverting(false);
        setProgress(0);
      }
    };

    if (isConverting) {
      setupEventSource();
    }

    return () => {
      if (eventSource) {
        eventSource.close();
        setProgress(0);
      }
    };
  }, [isConverting]);

  const convertToSpeech = async (text: string) => {
    try {
      setIsConverting(true);
      setProgress(0);
      
      // Keep this log for debugging the conversion start
      console.info('Starting file conversion...');
      const response = await fetch("/api/podcast", {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error("Failed to convert text to speech");
      }

      const result = await response.json();
      console.info('Conversion successful:', result);
      return result;
    } catch (error) {
      console.error('File conversion error:', error instanceof Error ? error.message : error);
      toast({
        title: "Error",
        description: "Failed to convert text to speech",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsConverting(false);
      setProgress(0);
    }
  };

  return {
    convertToSpeech,
    isConverting,
    setIsConverting,
    progress,
    setProgress
  };
}