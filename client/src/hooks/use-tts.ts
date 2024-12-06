import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export function useTTS() {
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupEventSource = () => {
      console.log('Setting up EventSource connection...');
      eventSource = new EventSource('/api/tts/progress');
      
      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Progress update received:', data);
          if (typeof data.progress === 'number') {
            setProgress(Math.round(data.progress));
          }
        } catch (error) {
          console.error('Error parsing progress data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        if (eventSource) {
          console.log('Closing EventSource due to error');
          eventSource.close();
          setIsConverting(false);
          setProgress(0);
        }
      };
    };

    if (isConverting) {
      setupEventSource();
    } else {
      if (eventSource) {
        console.log('Closing EventSource - conversion finished');
        eventSource.close();
        setProgress(0);
      }
    }

    return () => {
      if (eventSource) {
        console.log('Cleanup: Closing EventSource connection');
        eventSource.close();
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
