
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { PartyPopper } from "lucide-react";

interface SubscriptionSuccessProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
}

export function SubscriptionSuccess({ isOpen, onClose, planName }: SubscriptionSuccessProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md text-center p-6">
        <div className="flex flex-col items-center gap-4">
          <PartyPopper className="h-16 w-16 text-[#4CAF50] animate-bounce" />
          <h2 className="text-2xl font-bold">Welcome Aboard!</h2>
          <p className="text-xl text-[#4CAF50]">You're now a {planName} member</p>
          <p className="text-gray-400 mt-2">
            Thank you for your support. We're excited to have you as part of our community.
          </p>
          <Button 
            onClick={onClose}
            className="mt-4 bg-[#4CAF50] hover:bg-[#45a049] min-w-[200px]"
          >
            Let's Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
