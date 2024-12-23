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
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: string;
  onSubmit: (paymentMethod: string) => Promise<void>;
}

// Stripe Elements appearance configuration
const appearance: import('@stripe/stripe-js').Appearance = {
  theme: 'flat',
  variables: {
    colorPrimary: '#10b981',
    colorBackground: '#1f2937',
    colorText: '#ffffff',
    colorDanger: '#ef4444',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
    fontWeightNormal: '400',
    fontLineHeight: '1.5',
    colorTextPlaceholder: '#9ca3af',
    colorTextSecondary: '#d1d5db',
  },
  rules: {
    '.Label': {
      color: '#d1d5db',
      marginBottom: '8px',
      fontSize: '0.875rem',
      fontWeight: '500'
    },
    '.Input': {
      padding: '12px',
      border: '1px solid #374151',
      backgroundColor: '#111827',
      color: '#ffffff',
      '::placeholder': {
        color: '#9ca3af'
      }
    },
    '.Input:focus': {
      border: '2px solid #10b981',
      boxShadow: '0 0 0 1px #10b981'
    },
    '.Tab': {
      border: '1px solid #374151',
      backgroundColor: '#1f2937',
      color: '#d1d5db'
    },
    '.Tab:hover': {
      backgroundColor: '#374151',
      color: '#ffffff'
    },
    '.Tab--selected': {
      backgroundColor: '#10b981',
      borderColor: '#10b981',
      color: '#ffffff'
    },
    '.Error': {
      color: '#ef4444',
      marginTop: '8px',
      fontSize: '0.875rem'
    },
    '.Input--invalid': {
      borderColor: '#ef4444'
    },
    // Add explicit styling for helper text
    '.HelperText': {
      color: '#9ca3af',
      fontSize: '0.75rem',
      marginTop: '4px'
    },
    // Add styling for focused helper text
    '.Input:focus + .HelperText': {
      color: '#d1d5db'
    }
  }
};

function CheckoutForm({ planName, planPrice, onSubmit, onClose }: Omit<PaymentModalProps, 'isOpen'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: submitError, paymentMethod } = await stripe.createPaymentMethod({
        elements,
        params: {
          billing_details: {
            email: localStorage.getItem('userEmail') || '',
          },
        },
      });

      if (submitError) {
        setError(submitError.message || 'Payment failed');
        return;
      }

      await onSubmit(paymentMethod.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'An error occurred while processing your payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            defaultValues: {
              billingDetails: {
                email: localStorage.getItem('userEmail') || '',
              }
            },
            fields: {
              billingDetails: {
                email: 'never'
              }
            },
            // Add styles for the helper text container
            style: {
              base: {
                '::placeholder': {
                  color: '#9ca3af'
                },
                '.Message': {
                  color: '#d1d5db'
                },
                '.Message--error': {
                  color: '#ef4444'
                }
              }
            }
          }}
        />
      </div>

      {error && (
        <div className="text-red-500 text-sm mt-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-4 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !stripe}>
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
    if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
      setError('Stripe is not properly configured');
      return;
    }

    if (isOpen) {
      setError(null);
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
          setClientSecret(data.clientSecret);
        })
        .catch((err) => {
          setError(err?.message || 'Failed to initialize payment');
          console.error('Payment initialization error:', err);
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
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance,
            }}
          >
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