import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export function useTTS() {
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupEventSource = () => {
      // Create the EventSource instance
      const source = new window.EventSource('/api/tts/progress');
      eventSource = source;
      
      source.onopen = () => {
        // console.log('SSE connection opened');
      };
      
      source.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.progress === 'number') {
            setProgress(Math.round(data.progress));
          }
        } catch (error) {
          console.error('Error parsing progress data:', error);
        }
      };

      source.onerror = (error: Event) => {
        console.error('EventSource error:', error);
        if (source.readyState === EventSource.CLOSED) {
          setIsConverting(false);
          setProgress(0);
          source.close();
        }
      };
    };

    if (isConverting) {
      setupEventSource();
    } else if (eventSource?.readyState !== EventSource.CLOSED) {
      eventSource?.close();
      setProgress(0);
    }

    return () => {
      if (eventSource?.readyState !== EventSource.CLOSED) {
        eventSource?.close();
        setProgress(0);
      }
    };
  }, [isConverting]);

  const convertToSpeech = async (text: string) => {
    try {
      setIsConverting(true);
      setProgress(0);
      
      console.log('Starting conversion...');
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
      console.log('Conversion completed:', result);
      return result;
    } catch (error) {
      console.error('Conversion error:', error);
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
