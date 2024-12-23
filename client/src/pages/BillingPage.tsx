import { useUser } from "../hooks/use-user";
import { Button } from "../components/ui/button";
import { Check } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { PaymentModal } from "../components/PaymentModal";
import { useToast } from "../hooks/use-toast";

const plans = [
  {
    name: "Basic Plan",
    price: "9.99",
    period: "per month",
    features: [
      "Convert up to 50 articles/month",
      "Basic voice selection",
      "Standard quality audio",
      "Email support",
      "Basic analytics"
    ],
    buttonText: "Start Basic Plan",
    popular: false,
    priceId: "price_1OaUYKFZtbGQk9LCIWAy5BxV" // Test mode price ID for Basic Plan
  },
  {
    name: "Pro Plan",
    price: "24.99",
    period: "per month",
    features: [
      "Convert up to 200 articles/month",
      "Premium voice selection",
      "High quality audio",
      "Priority support",
      "Advanced analytics",
      "Custom intro/outro"
    ],
    buttonText: "Start Pro Plan",
    popular: true,
    priceId: "price_1OaUYvFZtbGQk9LCYQViVr3M" // Test mode price ID for Pro Plan
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
      "Custom branding"
    ],
    buttonText: "Start Enterprise Plan",
    popular: false,
    priceId: "price_1OaUZVFZtbGQk9LCq9z6jk2M" // Test mode price ID for Enterprise Plan
  }
];

export default function BillingPage() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<(typeof plans)[0] | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const { toast } = useToast();

  if (!user) return null;

  const handlePlanSelect = (plan: typeof plans[0]) => {
    setSelectedPlan(plan);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="container mx-auto px-6 py-24">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Select a monthly plan that best fits your needs. All plans include our core features with different usage limits.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl p-8 flex flex-col ${
              plan.popular
                ? "border-2 border-[#4CAF50] bg-[#4CAF50]/10"
                : "border border-gray-800 bg-gray-900"
            }`}
            style={{ minHeight: '600px' }}
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
              >
                {plan.buttonText}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selectedPlan && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          planName={selectedPlan.name}
          planPrice={selectedPlan.price}
          priceId={selectedPlan.priceId}
        />
      )}
    </div>
  );
}