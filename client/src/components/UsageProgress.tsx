import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { calculatePodifyTokensCost, convertToPodifyTokens } from "@/lib/utils";

interface UsageLimits {
  hasReachedLimit: boolean;
  limits?: {
    articles?: {
      used: number;
      limit: number;
      remaining: number;
      wouldExceed?: boolean;
    };
    podifyTokens?: {
      used: number;
      limit: number;
      remaining: number;
      wouldExceed?: boolean;
      cost: number;
    };
  };
  currentPeriod?: {
    month: string;
    resetsOn: string;
  };
}

export function UsageProgress({ 
  showUpgradeButton = true, 
  onLimitReached 
}: { 
  showUpgradeButton?: boolean;
  onLimitReached?: () => void;
}) {
  const [, setLocation] = useLocation();
  const { data: usage, isLoading } = useQuery<UsageLimits>({
    queryKey: ["usage-limits"],
    queryFn: async () => {
      const res = await fetch("/api/user/usage/check", {
        credentials: "include"
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Not authenticated");
        }
        throw new Error("Failed to fetch usage limits");
      }
      return res.json();
    },
    retry: false,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Early return if no usage data or required properties
  if (!usage?.limits) {
    return null;
  }

  // Safely extract values with defaults
  const articles = usage.limits.articles || { used: 0, limit: 1 };
  const podifyTokens = usage.limits.podifyTokens || { used: 0, limit: 1 };

  // Calculate percentages with protection against division by zero
  const articlesPercentage = articles.limit > 0 
    ? Math.min((articles.used / articles.limit) * 100, 100)
    : 0;

  const podifyTokensCost = podifyTokens.used * 0.005; // Each token is worth 0.5 cents
  const podifyTokensConverted = convertToPodifyTokens(podifyTokensCost);
  const podifyTokensLimit = podifyTokens.limit;

  const podifyTokensPercentage = podifyTokensLimit > 0
    ? Math.min((podifyTokensConverted / podifyTokensLimit) * 100, 100)
    : 0;

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Articles Converted ({articles.used}/{articles.limit})</span>
          <span>{Math.round(articlesPercentage)}%</span>
        </div>
        <Progress 
          value={articlesPercentage} 
          className={articlesPercentage >= 100 ? "bg-destructive/20" : ""}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            Podify Tokens ({podifyTokensConverted.toLocaleString()}/
            {podifyTokensLimit.toLocaleString()})
          </span>
          <span>${podifyTokensCost.toFixed(2)}</span>
        </div>
        <Progress 
          value={podifyTokensPercentage}
          className={podifyTokensPercentage >= 100 ? "bg-destructive/20" : ""}
        />
        <div className="text-xs text-muted-foreground">
          1 Podify Token = $0.005 (0.5¢)
        </div>
      </div>

      {usage.hasReachedLimit && (
        <div className="space-y-3 mt-4" onClick={() => onLimitReached?.()}>
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
            <p className="font-semibold mb-2">Monthly Usage Limit Reached</p>
            <p>You've reached your free tier limits for this month:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              {articles.used >= articles.limit && (
                <li>Maximum {articles.limit} articles per month reached ({articles.used} used)</li>
              )}
              {podifyTokensConverted >= podifyTokensLimit && (
                <li>Maximum {podifyTokensLimit.toLocaleString()} Podify Tokens per month reached (${podifyTokensCost.toFixed(2)} worth used)</li>
              )}
            </ul>
          </div>
          {showUpgradeButton && (
            <Button 
              variant="default"
              className="w-full"
              onClick={() => setLocation("/pricing")}
            >
              Upgrade Now
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}