import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useLocation } from "wouter";

const plans = [
  {
    name: "Individual Plan",
    price: "$9.99",
    period: "per month",
    features: [
      "Convert up to 10 articles/month",
      "Basic voice selection",
      "Standard quality audio",
      "Email support",
      "Basic analytics"
    ],
    buttonText: "Start Free Trial",
    popular: false
  },
  {
    name: "Creator Plan",
    price: "$24.99",
    period: "per month",
    features: [
      "Convert up to 50 articles/month",
      "Premium voice selection",
      "High quality audio",
      "Priority support",
      "Advanced analytics",
      "Custom intro/outro"
    ],
    buttonText: "Get Started",
    popular: true
  },
  {
    name: "Enterprise Plan",
    price: "Custom",
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
    buttonText: "Contact Sales",
    popular: false
  }
];

export default function PricingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Choose the perfect plan for your needs. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 flex flex-col h-full ${
                plan.popular
                  ? "border-2 border-[#4CAF50] bg-[#4CAF50]/10"
                  : "border border-gray-800 bg-gray-900"
              }`}
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
                <div className="text-3xl font-bold mb-1">{plan.price}</div>
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
                  className={`w-full ${
                    plan.popular ? "bg-[#4CAF50] hover:bg-[#45a049]" : ""
                  }`}
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => setLocation('/auth/signup')}
                >
                  {plan.buttonText}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}