import { useUser } from "../hooks/use-user";
import Sidebar from "../components/Sidebar";
import AudioPlayer from "../components/AudioPlayer";
import PodcastCard from "../components/PodcastCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import UploadDialog from "../components/UploadDialog";
import { useQuery } from "@tanstack/react-query";
import type { Podcast } from "@db/schema";

const FEATURED_COVERS = [
  "https://images.unsplash.com/photo-1559523275-98fb3c56faf6",
  "https://images.unsplash.com/photo-1453738773917-9c3eff1db985",
  "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4",
  "https://images.unsplash.com/photo-1493723843671-1d655e66ac1c",
];

export default function HomePage() {
  const { user } = useUser();
  const [uploadOpen, setUploadOpen] = useState(false);
  
  const { data: podcasts } = useQuery<Podcast[]>({
    queryKey: ["podcasts"],
    queryFn: async () => {
      const res = await fetch("/api/podcasts");
      if (!res.ok) throw new Error("Failed to fetch podcasts");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Welcome back, {user?.displayName || user?.username}</h1>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus size={16} />
            Add Content
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {podcasts?.map((podcast, i) => (
            <PodcastCard
              key={podcast.id}
              podcast={podcast}
              coverImage={podcast.coverImage || FEATURED_COVERS[i % FEATURED_COVERS.length]}
            />
          ))}
        </div>
      </main>

      <AudioPlayer />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
