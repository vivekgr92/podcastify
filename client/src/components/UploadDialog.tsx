import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPodcastSchema, type InsertPodcast } from "@db/schema";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTTS } from "../hooks/use-tts";
import { useToast } from "@/hooks/use-toast";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { convertToSpeech } = useTTS();
  
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
          <DialogTitle>Add New Content</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload">
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">Upload Audio</TabsTrigger>
            <TabsTrigger value="tts" className="flex-1">Text to Speech</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
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
          </TabsContent>

          <TabsContent value="tts">
            <div className="space-y-4">
              <FormItem>
                <FormLabel>Text or PDF</FormLabel>
                <Input type="file" accept=".pdf,.txt" />
              </FormItem>

              <Button
                onClick={() => convertToSpeech("Sample text")}
                className="w-full"
              >
                Convert to Speech
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
