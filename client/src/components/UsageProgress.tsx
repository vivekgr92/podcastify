import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface UsageLimits {
  hasReachedLimit: boolean;
  limits: {
    articles: {
      used: number;
      limit: number;
    };
    tokens: {
      used: number;
      limit: number;
    };
  };
}

export function UsageProgress({ showUpgradeButton = true }: { showUpgradeButton?: boolean }) {
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

  if (!usage) return null;

  const articlesPercentage = Math.min(
    (usage.limits.articles.used / usage.limits.articles.limit) * 100,
    100
  );
  const tokensPercentage = Math.min(
    (usage.limits.tokens.used / usage.limits.tokens.limit) * 100,
    100
  );

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Articles Converted ({usage.limits.articles.used}/{usage.limits.articles.limit})</span>
          <span>{Math.round(articlesPercentage)}%</span>
        </div>
        <Progress 
          value={articlesPercentage} 
          className={articlesPercentage >= 100 ? "bg-destructive/20" : ""}
        />
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Tokens Used ({usage.limits.tokens.used.toLocaleString()}/{usage.limits.tokens.limit.toLocaleString()})</span>
          <span>{Math.round(tokensPercentage)}%</span>
        </div>
        <Progress 
          value={tokensPercentage}
          className={tokensPercentage >= 100 ? "bg-destructive/20" : ""}
        />
      </div>

      {usage.hasReachedLimit && (
        <div className="space-y-3">
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            You've reached your usage limit. Please upgrade your plan to continue using the service.
          </div>
          {showUpgradeButton && (
            <Button 
              className="w-full bg-[#4CAF50] hover:bg-[#45a049]"
              onClick={() => setLocation("/pricing")}
            >
              View Pricing Plans
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
