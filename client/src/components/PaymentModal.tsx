import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// Initialize Stripe with the publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: string;
  priceId: string;
  userEmail?: string; // Add email to props
}

function CheckoutForm({ planName, planPrice, priceId, userEmail, onClose }: Omit<PaymentModalProps, 'isOpen'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'initial' | 'processing' | 'succeeded' | 'failed'>('initial');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError('Payment processing is not ready. Please try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPaymentStatus('processing');

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw submitError;
      }

      // Changed from confirmSetup to confirmPayment
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/billing?payment_status=success`,
        }
      });

      if (result.error) {
        throw result.error;
      }

      setPaymentStatus('succeeded');
      window.location.href = `${window.location.origin}/billing?payment_status=success`;
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setPaymentStatus('failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {error && (
        <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      {paymentStatus === 'processing' && (
        <div className="text-sm mt-2 p-2 bg-gray-800 rounded-md">
          Processing your payment...
        </div>
      )}

      <div className="flex justify-end gap-4 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting || !stripe || !elements || paymentStatus === 'succeeded'}
          className="bg-[#4CAF50] hover:bg-[#45a049] min-w-[200px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Subscribe for $${planPrice}/month`
          )}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({ isOpen, onClose, planName, planPrice, priceId, userEmail }: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    

    const initializePayment = async () => {
      try {
        setError(null);
        setClientSecret(null);

        const response = await fetch('/api/create-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId,
            planName,
            email: userEmail, // Include user's email in the request
          }),
          credentials: 'include',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to initialize subscription');
        }

        const data = await response.json();
        setClientSecret(data.clientSecret);
      } catch (err) {
        console.error('Subscription initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize subscription');
      }
    };

    initializePayment();
  }, [isOpen, priceId, planName, userEmail]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Subscribe to {planName}</DialogTitle>
          <DialogDescription>
            Enter your payment details to subscribe to the {planName} for ${planPrice}/month
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="text-red-500 text-sm mt-2 text-center">
            {error}
            <Button
              className="mt-4 w-full"
              onClick={() => {
                setError(null);
                onClose();
              }}
            >
              Close
            </Button>
          </div>
        ) : !clientSecret ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Elements 
            stripe={stripePromise} 
            options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: '#4CAF50',
                  colorBackground: '#1a1a1a',
                  colorText: '#ffffff'
                }
              }
            }}
          >
            <CheckoutForm
              planName={planName}
              planPrice={planPrice}
              priceId={priceId}
              userEmail={userEmail}
              onClose={onClose}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}