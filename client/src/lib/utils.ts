import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function convertToPodifyTokens(cost: number): number {
  // Add 90% margin to the cost
  const costWithMargin = cost * 1.9;
  // Each Podify Token is worth 0.5 cents (0.005 dollars)
  return Math.ceil(costWithMargin / 0.005);
}

export function calculatePodifyTokensCost(tokens: number): number {
  // Each token is worth 0.5 cents (0.005 dollars)
  return tokens * 0.005;
}