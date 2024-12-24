// Usage limits and token configuration
export const ARTICLE_LIMIT = 3; // Free tier limit
export const PODIFY_TOKEN_LIMIT = 10000; // Maximum tokens allowed
export const PODIFY_TOKEN_RATE = 0.005; // $0.005 (0.5 cents) per Podify Token
export const PODIFY_MARGIN = 0.6; // 60% margin

// Helper function to convert raw tokens to Podify Tokens
export function convertToPodifyTokens(totalCost: number): number {
  if (totalCost <= 0) return 0; // No tokens for zero or negative costs
  if (PODIFY_MARGIN <= 0 || PODIFY_MARGIN >= 1) {
    throw new Error("PODIFY_MARGIN must be between 0 and 1");
  }

  // Add margin to the cost
  const costWithMargin = totalCost / (1 - PODIFY_MARGIN);

  // Convert to Podify tokens (round up to avoid undercharging)
  return Math.ceil(costWithMargin / PODIFY_TOKEN_RATE);
}
