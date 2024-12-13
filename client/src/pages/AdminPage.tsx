import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, MessageSquare, FileAudio } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  totalConversions: number;
  totalFeedback: number;
}

interface UserFeedback {
  id: number;
  userId: number;
  username: string;
  podcastId: number;
  rating: number;
  comment: string;
  createdAt: string;
}

export default function AdminPage() {
  const { data: stats, isLoading: isStatsLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch admin stats");
      return res.json();
    },
  });

  const { data: feedback, isLoading: isFeedbackLoading } = useQuery<UserFeedback[]>({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const res = await fetch("/api/admin/feedback");
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json();
    },
  });

  if (isStatsLoading || isFeedbackLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Users</p>
              <h2 className="text-3xl font-bold">{stats?.totalUsers || 0}</h2>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Articles Converted</p>
              <h2 className="text-3xl font-bold">{stats?.totalConversions || 0}</h2>
            </div>
            <FileAudio className="h-8 w-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">User Feedback</p>
              <h2 className="text-3xl font-bold">{stats?.totalFeedback || 0}</h2>
            </div>
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Recent Feedback</h2>
        <div className="grid gap-4">
          {feedback?.map((item) => (
            <Card key={item.id} className="p-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{item.username}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="px-2 py-1 bg-primary/10 rounded-md">
                  Rating: {item.rating}/5
                </div>
              </div>
              <p className="text-sm">{item.comment}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
