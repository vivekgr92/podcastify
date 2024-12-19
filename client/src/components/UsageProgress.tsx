import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { calculatePodifyTokensCost } from "@/lib/utils";

interface UsageLimits {
  hasReachedLimit: boolean;
  limits: {
    articles: {
      used: number;
      limit: number;
      remaining: number;
      wouldExceed?: boolean;
    };
    podifyTokens: {
      used: number;
      limit: number;
      remaining: number;
      wouldExceed?: boolean;
      cost: number;
    };
  };
  currentPeriod: {
    month: string;
    resetsOn: string;
  };
  pricing?: {
    estimatedCost: number;
    podifyTokens: number;
  };
  upgradePlans?: {
    monthly: {
      name: string;
      price: number;
      features: string[];
    };
    annual: {
      name: string;
      price: number;
      features: string[];
    };
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

  // Return early if usage data is not available or malformed
  if (!usage?.limits?.articles || !usage?.limits?.podifyTokens) {
    return null;
  }

  // Safely extract values with defaults
  const articlesUsed = usage.limits.articles.used ?? 0;
  const articlesLimit = usage.limits.articles.limit ?? 1;
  const podifyTokensUsed = usage.limits.podifyTokens.used ?? 0;
  const podifyTokensLimit = usage.limits.podifyTokens.limit ?? 1;

  // Calculate percentages with protection against division by zero
  const articlesPercentage = articlesLimit > 0 
    ? Math.min((articlesUsed / articlesLimit) * 100, 100)
    : 0;

  const podifyTokensPercentage = podifyTokensLimit > 0
    ? Math.min((podifyTokensUsed / podifyTokensLimit) * 100, 100)
    : 0;

  // Calculate token cost using the utility function
  const tokenCost = calculatePodifyTokensCost(podifyTokensUsed);

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Articles Converted ({articlesUsed}/{articlesLimit})</span>
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
            Podify Tokens ({podifyTokensUsed.toLocaleString()}/
            {podifyTokensLimit.toLocaleString()})
          </span>
          <span>${tokenCost.toFixed(2)}</span>
        </div>
        <Progress 
          value={podifyTokensPercentage}
          className={podifyTokensPercentage >= 100 ? "bg-destructive/20" : ""}
        />
        <div className="text-xs text-muted-foreground">
          1 Podify Token = $0.005 (0.5¢)
        </div>
      </div>

      <div className="text-xs text-muted-foreground mt-2">
        Current period: {new Date(usage.currentPeriod?.month || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        <br />
        Resets on: {new Date(usage.currentPeriod?.resetsOn || Date.now()).toLocaleDateString()}
      </div>

      {usage.hasReachedLimit && (
        <div className="space-y-3 mt-4" onClick={() => onLimitReached?.()}>
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm cursor-pointer hover:bg-destructive/20 transition-colors">
            <p className="font-semibold mb-2">Monthly Usage Limit Reached</p>
            <p>You've reached your free tier limits for this month:</p>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              {articlesUsed >= articlesLimit && (
                <li>Maximum {articlesLimit} articles per month reached ({articlesUsed} used)</li>
              )}
              {podifyTokensUsed >= podifyTokensLimit && (
                <li>Maximum {podifyTokensLimit.toLocaleString()} Podify Tokens per month reached (${tokenCost.toFixed(2)} worth used)</li>
              )}
            </ul>

            {usage.upgradePlans && (
              <>
                <div className="mt-4 space-y-4">
                  <div className="bg-card p-4 rounded-lg">
                    <h4 className="font-semibold text-primary mb-2">{usage.upgradePlans.monthly.name} Plan - ${usage.upgradePlans.monthly.price}/month</h4>
                    <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                      {usage.upgradePlans.monthly.features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-card p-4 rounded-lg">
                    <h4 className="font-semibold text-primary mb-2">{usage.upgradePlans.annual.name} - ${usage.upgradePlans.annual.price}/year</h4>
                    <ul className="list-disc ml-4 space-y-1 text-muted-foreground">
                      {usage.upgradePlans.annual.features.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}

            {usage.pricing && (
              <div className="mt-4 p-4 bg-card rounded-lg">
                <h4 className="font-semibold text-primary mb-2">Current Usage Details</h4>
                <ul className="space-y-2 text-muted-foreground">
                  <li>Cost: ${usage.pricing.estimatedCost.toFixed(2)}</li>
                  <li>Podify Tokens: {usage.pricing.podifyTokens.toLocaleString()}</li>
                </ul>
              </div>
            )}
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