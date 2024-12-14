import { useContext } from "react";
import { ConversionContext } from "../context/ConversionContext";

export function useConversion() {
  const context = useContext(ConversionContext);
  if (!context) {
    throw new Error("useConversion must be used within a ConversionProvider");
  }
  return context;
}
