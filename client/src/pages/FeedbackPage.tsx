import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Star, StarHalf } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const feedbackSchema = z.object({
  content: z.string().min(10, "Feedback must be at least 10 characters long"),
  rating: z.number().min(1).max(5),
});

type FeedbackForm = z.infer<typeof feedbackSchema>;

export default function FeedbackPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rating, setRating] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeedbackForm>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      content: "",
      rating: 0,
    },
  });

  const onSubmit = async (data: FeedbackForm) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }

      toast({
        title: "Success",
        description: "Thank you for your feedback!",
      });

      reset();
      setRating(0);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Share Your Feedback</h1>
        <Card className="p-6 bg-gray-900 border-gray-800">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                How would you rate your experience?
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`p-1 hover:text-yellow-400 transition-colors ${
                      value <= rating ? "text-yellow-400" : "text-gray-400"
                    }`}
                    onClick={() => {
                      setRating(value);
                      register("rating").onChange({
                        target: { value, name: "rating" },
                      });
                    }}
                  >
                    <Star className="w-8 h-8" />
                  </button>
                ))}
              </div>
              {errors.rating && (
                <p className="text-red-400 text-sm mt-1">
                  Please select a rating
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Your Feedback
              </label>
              <Textarea
                {...register("content")}
                placeholder="Tell us what you think about Podify..."
                className="min-h-[150px] bg-gray-800 border-gray-700"
              />
              {errors.content && (
                <p className="text-red-400 text-sm mt-1">
                  {errors.content.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#4CAF50] hover:bg-[#45a049]"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
