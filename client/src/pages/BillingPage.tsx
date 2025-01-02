
import * as React from "react";
import { useState, useEffect } from "react";
import { useUser } from "../hooks/use-user";
import { Button } from "../components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { PaymentModal } from "../components/PaymentModal";
import { useToast } from "../hooks/use-toast";
import { LoadingScreen } from "../components/LoadingScreen";
import { Separator } from "../components/ui/separator";

type Plan = {
  name: string;
  price: string;
  period: string;
  features: string[];
  buttonText: string;
  popular: boolean;
  priceId: string;
};

const plans: Plan[] = [
  {
    name: "Basic Plan",
    price: "9.99",
    period: "per month",
    features: [
      "Convert up to 20 articles/month",
      "Basic voice selection",
      "Standard quality audio",
      "Email support",
      "Basic analytics",
    ],
    buttonText: "Subscribe Now",
    popular: false,
    priceId: "price_1Qb8xDBwEMzOkTIKEcpAxav4",
  },
  {
    name: "Pro Plan",
    price: "24.99",
    period: "per month",
    features: [
      "Convert up to 50 articles/month",
      "Premium voice selection",
      "High quality audio",
      "Priority support",
      "Advanced analytics",
      "Custom intro/outro",
    ],
    buttonText: "Subscribe Now",
    popular: true,
    priceId: "price_1QaJICBwEMzOkTIKbuyKiDjb",
  },
  {
    name: "Enterprise Plan",
    price: "99.99",
    period: "per month",
    features: [
      "Unlimited conversions",
      "All premium voices",
      "Highest quality audio",
      "24/7 dedicated support",
      "Custom analytics dashboard",
      "API access",
      "Custom branding",
    ],
    buttonText: "Subscribe Now",
    popular: false,
    priceId: "price_1QaJICBwEMzOkTIKRE8yNZHc",
  },
];

const BillingPage: React.FC = () => {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment_status");
    const message = params.get("message");

    if (paymentStatus === "success") {
      toast({
        title: "Subscription Successful!",
        description: "Your subscription has been activated. Welcome aboard!",
        duration: 5000,
      });
      window.history.replaceState({}, "", "/billing");
    } else if (paymentStatus === "failed") {
      toast({
        title: "Payment Failed",
        description: message || "There was an issue with your payment. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      window.history.replaceState({}, "", "/billing");
    }
  }, [toast]);

  const redirectToCustomerPortal = async () => {
    try {
      setIsLoadingPortal(true);
      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to create portal session");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not access subscription management. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPortal(false);
    }
  };

  if (!user) {
    return null;
  }

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsPaymentModalOpen(true);
  };

  const hasActiveSubscription = user.subscriptionStatus && 
                              user.subscriptionStatus !== "inactive" && 
                              user.subscriptionStatus !== "canceled" &&
                              user.subscriptionType !== "free";

  const getCurrentPlan = () => {
    if (!user.subscriptionType || user.subscriptionType === "free") {
      return null;
    }
    return plans.find(plan => plan.name === user.subscriptionType) || null;
  };

  const currentPlan = getCurrentPlan();

  return (
    <div className="container mx-auto px-6 py-12 space-y-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Billing & Subscription</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          {hasActiveSubscription 
            ? "Manage your subscription and billing details"
            : "Choose a plan that best fits your needs"}
        </p>
      </div>

      {hasActiveSubscription && (
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-semibold mb-6">Current Subscription</h2>
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Plan</span>
                <span className="capitalize">{currentPlan?.name || user.subscriptionType || "Free"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status</span>
                <span className="capitalize">{user.subscriptionStatus}</span>
              </div>
              {user.currentPeriodEnd && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Next billing date</span>
                  <span>
                    {new Date(user.currentPeriodEnd).toLocaleDateString()}
                  </span>
                </div>
              )}
              <Button
                onClick={redirectToCustomerPortal}
                disabled={isLoadingPortal}
                className="w-full mt-6"
              >
                {isLoadingPortal ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  "Manage Subscription"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Separator className="my-12" />

      <div className="mt-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-semibold mb-4">Available Plans</h2>
          <p className="text-gray-400">
            {hasActiveSubscription 
              ? "Compare your current plan with other options"
              : "Select a plan that best fits your needs"}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan?.name === plan.name;

            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.popular
                    ? "border-2 border-[#4CAF50] bg-[#4CAF50]/10"
                    : "border border-gray-800 bg-gray-900"
                }`}
                style={{ minHeight: "600px" }}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[#4CAF50] text-white px-3 py-1 rounded-full text-sm">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <div className="text-3xl font-bold mb-1">${plan.price}</div>
                  <div className="text-gray-400 text-sm">{plan.period}</div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start">
                      <Check className="h-5 w-5 text-[#4CAF50] shrink-0 mr-3" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  <Button
                    className={`w-full h-10 ${
                      plan.popular ? "bg-[#4CAF50] hover:bg-[#45a049]" : ""
                    }`}
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handlePlanSelect(plan)}
                    disabled={Boolean(hasActiveSubscription) && !isCurrentPlan}
                  >
                    {isCurrentPlan 
                      ? "Current Plan"
                      : hasActiveSubscription
                      ? "Manage Current Plan First"
                      : plan.buttonText}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedPlan && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          planName={selectedPlan.name}
          planPrice={selectedPlan.price}
          priceId={selectedPlan.priceId}
          userEmail={user.email}
          onProcessingStart={() => setIsProcessingPayment(true)}
          onProcessingEnd={() => setIsProcessingPayment(false)}
        />
      )}
      {(isProcessingPayment || isLoadingPortal) && <LoadingScreen />}
    </div>
  );
};

export default BillingPage;
