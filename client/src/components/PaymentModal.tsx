import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: string;
  onSubmit: (paymentMethod: string) => Promise<void>;
}

function CheckoutForm({ planName, planPrice, onSubmit, onClose }: Omit<PaymentModalProps, 'isOpen'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      console.error('Stripe or elements not initialized');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Starting payment submission process...');

      // Step 1: Submit the form elements
      console.log('Submitting form elements...');
      const { error: submitError } = await elements.submit();
      if (submitError) {
        console.error('Form submission error:', submitError);
        throw new Error(submitError.message);
      }

      // Step 2: Create Payment Method
      console.log('Creating payment method...');
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
        params: {
          billing_details: {
            email: localStorage.getItem('userEmail') || '',
          },
        },
      });

      if (paymentMethodError) {
        console.error('Payment method creation error:', paymentMethodError);
        throw new Error(paymentMethodError.message);
      }

      if (!paymentMethod?.id) {
        throw new Error('Failed to create payment method');
      }

      // Step 3: Submit to server
      console.log('Submitting to server...');
      await onSubmit(paymentMethod.id);
      console.log('Payment process completed successfully');
      onClose();
    } catch (err) {
      console.error('Payment processing error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while processing your payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {error && (
        <div className="text-red-500 text-sm mt-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-4 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting || !stripe || !elements}
          className="bg-[#4CAF50] hover:bg-[#45a049]"
        >
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
  );
}

export function PaymentModal({ isOpen, onClose, planName, planPrice, onSubmit }: PaymentModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
      console.error('Stripe publishable key is missing');
      setError('Stripe is not properly configured');
      return;
    }

    if (isOpen) {
      setError(null);
      console.log('Initializing payment intent...');

      // Create a PaymentIntent on the server
      fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planName,
          planPrice: parseFloat(planPrice.replace('$', '')),
        }),
        credentials: 'include', // Include cookies for authentication
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }
          console.log('Payment intent created successfully');
          setClientSecret(data.clientSecret);
        })
        .catch((err) => {
          console.error('Payment initialization error:', err);
          setError(err?.message || 'Failed to initialize payment');
        });
    }
  }, [isOpen, planName, planPrice]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Subscribe to {planName}</DialogTitle>
          <DialogDescription>
            Enter your payment details to subscribe to the {planName} for {planPrice}/month
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
        ) : clientSecret ? (
          <Elements stripe={stripePromise} options={{ 
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#4CAF50',
              },
            },
          }}>
            <CheckoutForm
              planName={planName}
              planPrice={planPrice}
              onSubmit={onSubmit}
              onClose={onClose}
            />
          </Elements>
        ) : (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}