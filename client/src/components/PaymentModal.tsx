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
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: string;
  priceId: string;
}

function CheckoutForm({ planName, planPrice, priceId, onClose }: Omit<PaymentModalProps, 'isOpen'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'initial' | 'processing' | 'requires_action' | 'succeeded' | 'failed'>('initial');

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
      // Confirm the subscription
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/billing?payment_status=success`,
          payment_method_data: {
            billing_details: {
              name: `${planName} Subscription`,
            },
          },
        },
      });

      if (confirmError) {
        if (confirmError.type === 'card_error' || confirmError.type === 'validation_error') {
          setError(confirmError.message || 'Payment failed. Please try again.');
          setPaymentStatus('failed');
        } else {
          setError('An unexpected error occurred.');
          setPaymentStatus('failed');
        }
      } else {
        setPaymentStatus('succeeded');
      }
    } catch (err) {
      console.error('Payment processing error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while processing your payment.');
      setPaymentStatus('failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case 'processing':
        return 'Processing your subscription...';
      case 'requires_action':
        return 'Additional verification required...';
      case 'succeeded':
        return 'Payment successful! Redirecting...';
      case 'failed':
        return 'Payment failed. Please try again.';
      default:
        return '';
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

      {paymentStatus !== 'initial' && paymentStatus !== 'failed' && (
        <div className="text-sm mt-2 p-2 bg-gray-800 rounded-md">
          {getStatusMessage()}
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

export function PaymentModal({ isOpen, onClose, planName, planPrice, priceId }: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const initializePayment = async () => {
      try {
        setError(null);
        setClientSecret(null);

        const response = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId,
          }),
          credentials: 'include',
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to initialize payment');
        }

        setClientSecret(data.clientSecret);
      } catch (err) {
        console.error('Payment initialization error:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize payment');
      }
    };

    initializePayment();
  }, [isOpen, priceId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
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
              onClose={onClose}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}