import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: string;
  onSubmit: (cardDetails: CardDetails) => Promise<void>;
}

interface CardDetails {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  name: string;
}

export function PaymentModal({ isOpen, onClose, planName, planPrice, onSubmit }: PaymentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetails>({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(cardDetails);
      onClose();
    } catch (error) {
      console.error("Payment failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Subscribe to {planName}</DialogTitle>
          <DialogDescription>
            Enter your payment details to subscribe to the {planName} for {planPrice}/month
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Card Holder Name</label>
            <Input
              placeholder="John Doe"
              value={cardDetails.name}
              onChange={(e) => setCardDetails({ ...cardDetails, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Card Number</label>
            <Input
              placeholder="4242 4242 4242 4242"
              value={cardDetails.cardNumber}
              onChange={(e) => setCardDetails({ ...cardDetails, cardNumber: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Expiry Date</label>
              <Input
                placeholder="MM/YY"
                value={cardDetails.expiryDate}
                onChange={(e) => setCardDetails({ ...cardDetails, expiryDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CVV</label>
              <Input
                placeholder="123"
                type="password"
                maxLength={4}
                value={cardDetails.cvv}
                onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Pay ${planPrice}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}