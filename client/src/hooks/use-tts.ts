import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function useTTS() {
  const [isConverting, setIsConverting] = useState(false);
  const { toast } = useToast();

  const convertToSpeech = async (text: string) => {
    setIsConverting(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("Failed to convert text to speech");
      }

      return await response.json();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to convert text to speech",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return {
    convertToSpeech,
    isConverting,
  };
}
