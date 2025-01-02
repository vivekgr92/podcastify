import { Progress } from "./ui/progress";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface UsageLimits {
  hasReachedLimit: boolean;
  limits: {
    articles: {
      used: number;
      limit: number;
      remaining: number;
    };
    tokens: {
      used: number;
      limit: number;
      remaining: number;
      podifyTokens: {
        used: number;
        limit: number;
        remaining: number;
      };
    };
  };
  currentPeriod?: {
    month: string;
    resetsOn: string;
  };
}

export function UsageProgress({
  showUpgradeButton = true,
  onLimitReached,
}: {
  showUpgradeButton?: boolean;
  onLimitReached?: () => void;
}) {
  const [, setLocation] = useLocation();

  const {
    data: usage,
    isLoading,
    error,
  } = useQuery<UsageLimits>({
    queryKey: ["usage-limits"],
    queryFn: async () => {
      const res = await fetch("/api/user/usage/check");
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Not authenticated");
        }
        throw new Error("Failed to fetch usage limits");
      }
      return res.json();
    },
    retry: false,
    refetchInterval: 5000,
    staleTime: 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error || !usage?.limits) {
    return (
      <Card className="p-4">
        <div className="text-sm text-destructive">
          Failed to load usage data. Please try again later.
        </div>
      </Card>
    );
  }

  const articles = usage.limits.articles;
  const podifyTokens = usage.limits.tokens.podifyTokens;

  const articlesPercentage = Math.min(
    (articles.used / articles.limit) * 100,
    100,
  );
  const podifyTokensPercentage = Math.min(
    (podifyTokens.used / podifyTokens.limit) * 100,
    100,
  );

  const podifyTokensCost = (podifyTokens.used * 0.005).toFixed(2);

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
            {podifyTokens.limit.toLocaleString()})
          </span>
          <span>{Math.round(podifyTokensPercentage)}%</span>
        </div>
        <Progress
          value={podifyTokensPercentage}
          className={podifyTokensPercentage >= 100 ? "bg-destructive/20" : ""}
        />
        <div className="text-xs text-muted-foreground">
          Cost: ${podifyTokensCost} (1 Podify Token = $0.005)
        </div>
      </div>

      {resetDate && (
        <div className="text-xs text-muted-foreground mt-4">
          Limits reset on: {resetDate}
        </div>
      )}

      {usage.hasReachedLimit && (
        <div className="space-y-3 mt-4">
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
              {podifyTokens.used >= podifyTokens.limit && (
                <li>
                  Maximum {podifyTokens.limit.toLocaleString()} Podify Tokens
                  per month reached (${podifyTokensCost} worth used)
                </li>
              )}
            </ul>
          </div>
          {showUpgradeButton && (
            <Button
              variant="default"
              className="w-full"
              onClick={() => {
                if (onLimitReached) {
                  onLimitReached();
                } else {
                  setLocation("/billing");
                }
              }}
            >
              Upgrade Now
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
