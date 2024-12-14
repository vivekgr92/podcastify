import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ConversionContextType {
  isConverting: boolean;
  conversionProgress: number;
  setIsConverting: (value: boolean) => void;
  setConversionProgress: (value: number) => void;
}

export const ConversionContext = createContext<ConversionContextType>({
  isConverting: false,
  conversionProgress: 0,
  setIsConverting: () => {},
  setConversionProgress: () => {},
});

export function ConversionProvider({ children }: { children: ReactNode }) {
  // Use localStorage to persist conversion state
  const [isConverting, setIsConverting] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('isConverting');
    return stored ? JSON.parse(stored) : false;
  });
  
  const [conversionProgress, setConversionProgress] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem('conversionProgress');
    return stored ? JSON.parse(stored) : 0;
  });

  // Update localStorage when state changes and clean up when conversion is done
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isConverting) {
        localStorage.setItem('isConverting', JSON.stringify(isConverting));
        localStorage.setItem('conversionProgress', JSON.stringify(conversionProgress));
      } else {
        localStorage.removeItem('isConverting');
        localStorage.removeItem('conversionProgress');
      }
    }
  }, [isConverting, conversionProgress]);

  // Reset conversion state when component unmounts
  useEffect(() => {
    return () => {
      if (!isConverting) {
        localStorage.removeItem('isConverting');
        localStorage.removeItem('conversionProgress');
      }
    };
  }, [isConverting]);

  const value = {
    isConverting,
    conversionProgress,
    setIsConverting,
    setConversionProgress,
  };

  return (
    <ConversionContext.Provider value={value}>
      {children}
    </ConversionContext.Provider>
  );
}

export function useConversion() {
  const context = useContext(ConversionContext);
  if (!context) {
    throw new Error("useConversion must be used within a ConversionProvider");
  }
  return context;
}
