import { useUser } from "../hooks/use-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2 } from "lucide-react";

const pricingPlans = [
  {
    name: "Free",
    price: 0,
    features: [
      "5 articles per month",
      "Basic voice selection",
      "Standard quality audio",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: 9.99,
    features: [
      "50 articles per month",
      "Premium voices",
      "High quality audio",
      "Priority support",
      "Custom voice training",
    ],
  },
  {
    name: "Enterprise",
    price: 29.99,
    features: [
      "Unlimited articles",
      "All premium voices",
      "Highest quality audio",
      "24/7 priority support",
      "Custom voice training",
      "API access",
    ],
  },
];

const billingFormSchema = z.object({
  cardNumber: z.string().min(16).max(16),
  expiryDate: z.string().regex(/^\d{2}\/\d{2}$/, "Invalid expiry date"),
  cvc: z.string().min(3).max(4),
  name: z.string().min(1, "Name is required"),
});

type BillingFormData = z.infer<typeof billingFormSchema>;

export default function BillingPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const form = useForm<BillingFormData>({
    resolver: zodResolver(billingFormSchema),
  });

  const onSubmit = async (data: BillingFormData) => {
    if (!selectedPlan) {
      toast({
        title: "Error",
        description: "Please select a plan first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // TODO: Implement payment processing
      toast({
        title: "Success",
        description: "Your subscription has been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) return null;

  return (
    <div className="container max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Subscription Plans</h1>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {pricingPlans.map((plan) => (
          <Card 
            key={plan.name}
            className={`p-6 cursor-pointer transition-all ${
              selectedPlan === plan.name 
                ? "ring-2 ring-primary" 
                : "hover:shadow-lg"
            }`}
            onClick={() => setSelectedPlan(plan.name)}
          >
            <div className="mb-4">
              <h3 className="text-xl font-bold">{plan.name}</h3>
              <p className="text-3xl font-bold mt-2">
                ${plan.price}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            <Button 
              className="w-full"
              variant={selectedPlan === plan.name ? "default" : "outline"}
            >
              {selectedPlan === plan.name ? "Selected" : "Select Plan"}
            </Button>
          </Card>
        ))}
      </div>

      {selectedPlan && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-6">Payment Information</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cardholder Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John Doe" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cardNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Card Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="1234 5678 9012 3456" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="MM/YY" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cvc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CVC</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="123" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing
                  </>
                ) : (
                  `Subscribe to ${selectedPlan} Plan`
                )}
              </Button>
            </form>
          </Form>
        </Card>
      )}
    </div>
  );
}
