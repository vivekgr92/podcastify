import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { calculatePodifyTokensCost } from "@/lib/utils";

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

const PODIFY_TOKENS_LIMIT = 10000; // Define constant for token limit

export function UsageProgress({
  showUpgradeButton = true,
  onLimitReached,
}: {
  showUpgradeButton?: boolean;
  onLimitReached?: () => void;
}) {
  const [, setLocation] = useLocation();
  const { data: usage, isLoading } = useQuery<UsageLimits>({
    queryKey: ["usage-limits"],
    queryFn: async () => {
      const res = await fetch("/api/user/usage/check", {
        credentials: "include",
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
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Early return if no usage data
  if (!usage?.limits) {
    return null;
  }

  // Safely extract values with defaults
  const articles = usage.limits.articles || { used: 0, limit: 1 };
  const podifyTokens = usage.limits.podifyTokens || {
    used: 0,
    limit: PODIFY_TOKENS_LIMIT,
  };

  // Calculate percentages with protection against division by zero
  const articlesPercentage =
    articles.limit > 0
      ? Math.min((articles.used / articles.limit) * 100, 100)
      : 0;

  const podifyTokensPercentage = Math.min(
    (podifyTokens.used / PODIFY_TOKENS_LIMIT) * 100,
    100,
  );
  const podifyTokensCost = calculatePodifyTokensCost(podifyTokens.used);

  // Format the reset date if available
  const resetDate = usage.currentPeriod?.resetsOn
    ? new Date(usage.currentPeriod.resetsOn).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>
            Articles Converted ({articles.used}/{articles.limit})
          </span>
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
            Podify Tokens ({podifyTokens.used.toLocaleString()}/
            {PODIFY_TOKENS_LIMIT.toLocaleString()})
          </span>
          <span>{podifyTokensPercentage}%</span>
        </div>
        <Progress
          value={podifyTokensPercentage}
          className={podifyTokensPercentage >= 100 ? "bg-destructive/20" : ""}
        />
        <div className="text-xs text-muted-foreground">
          1 Podify Token = $0.005 (0.5¢)
        </div>
      </div>

      {resetDate && (
        <div className="text-xs text-muted-foreground mt-4">
          Limits reset on: {resetDate}
        </div>
      )}

      {usage.hasReachedLimit && (
        <div className="space-y-3 mt-4" onClick={() => onLimitReached?.()}>
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
            <p className="font-semibold mb-2">Monthly Usage Limit Reached</p>
            <p>You've reached your free tier limits for this month:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              {articles.used >= articles.limit && (
                <li>
                  Maximum {articles.limit.toLocaleString()} articles per month
                  reached ({articles.used.toLocaleString()} used)
                </li>
              )}
              {podifyTokens.used >= PODIFY_TOKENS_LIMIT && (
                <li>
                  Maximum {PODIFY_TOKENS_LIMIT.toLocaleString()} Podify Tokens
                  per month reached (${podifyTokensCost.toFixed(2)} worth used)
                </li>
              )}
            </ul>
          </div>
          {showUpgradeButton && (
            <Button
              variant="success"
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
