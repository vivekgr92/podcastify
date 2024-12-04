import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Plus } from "lucide-react";
import type { Podcast } from "@db/schema";
import { useAudio } from "../hooks/use-audio";

interface PodcastCardProps {
  podcast: Podcast;
  coverImage: string;
}

export default function PodcastCard({ podcast, coverImage }: PodcastCardProps) {
  const { play } = useAudio();

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow">
      <CardContent className="p-0 relative">
        <img
          src={coverImage}
          alt={podcast.title}
          className="w-full aspect-square object-cover"
        />
        <Button
          size="icon"
          className="absolute bottom-4 right-4 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => play(podcast)}
        >
          <Play size={20} />
        </Button>
      </CardContent>
      
      <CardFooter className="p-4 flex justify-between items-start">
        <div>
          <h3 className="font-medium line-clamp-1">{podcast.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {podcast.description}
          </p>
        </div>
        <Button variant="ghost" size="icon">
          <Plus size={16} />
        </Button>
      </CardFooter>
    </Card>
  );
}
