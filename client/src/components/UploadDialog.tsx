import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPodcastSchema, type InsertPodcast } from "@db/schema";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const form = useForm<InsertPodcast>({
    resolver: zodResolver(insertPodcastSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "upload",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        body: data,
      });
      if (!res.ok) throw new Error("Failed to upload podcast");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload podcast",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Podcast</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ''} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>Audio File</FormLabel>
              <Input type="file" accept="audio/*" />
            </FormItem>

            <FormItem>
              <FormLabel>Cover Image</FormLabel>
              <Input type="file" accept="image/*" />
            </FormItem>

            <Button type="submit" className="w-full">
              Upload
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}