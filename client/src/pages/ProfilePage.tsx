import { useUser } from "../hooks/use-user";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { useState } from "react";

export default function ProfilePage() {
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);

  if (!user) return null;

  const formatOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', formatOptions) : 'N/A';

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <Card className="p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <Avatar className="h-32 w-32">
              <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                {user.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button
              size="icon"
              variant="secondary"
              className="absolute bottom-0 right-0 rounded-full"
              onClick={() => {
                // TODO: Implement photo upload
              }}
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>
          <h1 className="text-2xl font-bold">{user.displayName || user.username}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>

        <div className="grid gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <h2 className="font-semibold mb-2">Account Details</h2>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Username</dt>
                <dd>{user.username}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Member Since</dt>
                <dd>{joinDate}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Account Type</dt>
                <dd>{user.isAdmin ? 'Administrator' : 'Standard User'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>
    </div>
  );
}
