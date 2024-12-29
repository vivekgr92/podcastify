
import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center flex-col gap-4">
      <Loader2 className="h-12 w-12 animate-spin text-[#4CAF50]" />
      <p className="text-lg font-medium">Processing your payment...</p>
      <p className="text-sm text-muted-foreground">Please don't close this window</p>
    </div>
  );
}
