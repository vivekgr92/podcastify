import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, MessageSquare, FileAudio, Coins } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface AdminStats {
  totalUsers: number;
  totalConversions: number;
  totalFeedback: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTtsCharacters: number;
  totalCost: number;
  usageByDay: {
    date: string;
    inputTokens: number;
    outputTokens: number;
    ttsCharacters: number;
    cost: number;
  }[];
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
      
      <Tabs defaultValue="overview" className="mb-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <p className="text-sm font-medium text-muted-foreground">Total Cost</p>
                  <h2 className="text-3xl font-bold">${stats?.totalCost?.toFixed(2) || '0.00'}</h2>
                </div>
                <Coins className="h-8 w-8 text-primary" />
              </div>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="usage">
          <div className="grid gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Usage Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Total Input Tokens</p>
                  <p className="text-2xl font-bold">{stats?.totalInputTokens?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Output Tokens</p>
                  <p className="text-2xl font-bold">{stats?.totalOutputTokens?.toLocaleString() || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total TTS Characters</p>
                  <p className="text-2xl font-bold">{stats?.totalTtsCharacters?.toLocaleString() || 0}</p>
                </div>
              </div>
              
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.usageByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                      formatter={(value, name) => {
                        switch(name) {
                          case 'cost':
                            return [`$${Number(value).toFixed(2)}`, 'Cost'];
                          default:
                            return [value.toLocaleString(), name];
                        }
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="#4CAF50" 
                      name="Cost"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Token Usage Over Time</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.usageByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="inputTokens" 
                      stroke="#2196F3" 
                      name="Input Tokens"
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="outputTokens" 
                      stroke="#FF9800" 
                      name="Output Tokens"
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="ttsCharacters" 
                      stroke="#E91E63" 
                      name="TTS Characters"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

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
