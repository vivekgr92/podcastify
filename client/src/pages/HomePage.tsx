import { useCallback, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useTTS } from "../hooks/use-tts";
import { FileText, Upload, Headphones, Plus, Menu, ChevronDown, ChevronUp } from "lucide-react";
import { Logo } from "../components/Logo";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../hooks/use-user";
import { UsageProgress } from "../components/UsageProgress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);
  const { toast } = useToast();
  const location = useLocation()[0];

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const {
    convertToSpeech,
    isConverting,
    setIsConverting,
    progress,
    setProgress,
  } = useTTS();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!selectedCategory) {
        toast({
          title: "Category Required", 
          description: "Please select a podcast category before uploading",
          variant: "destructive",
        });
        return;
      }

      if (hasReachedLimit) {
        toast({
          title: "Usage Limit Reached",
          description: "Please upgrade your plan to continue converting articles.",
          variant: "destructive",
        });
        return;
      }

      const file = acceptedFiles[0];
      if (file) {
        if (file.type === "text/plain" || file.type === "application/pdf") {
          setFile(file);

          const formData = new FormData();
          formData.append("file", file);

          try {
            setProgress(0);
            setIsConverting(true);

            console.log("Starting file conversion...");
            const response = await fetch("/api/podcast", {
              method: "POST",
              body: formData,
              credentials: "include",
            });

            if (!response.ok) {
              throw new Error("Failed to convert file");
            }

            const podcast = await response.json();
            console.log("Conversion successful:", podcast);

            toast({
              title: "Success",
              description: "Your file has been converted successfully!",
            });

            await queryClient.invalidateQueries({ queryKey: ["podcasts"] });
            setLocation("/library");
          } catch (error) {
            console.error("File conversion error:", error);
            toast({
              title: "Error",
              description: "Failed to convert your file. Please try again.",
              variant: "destructive",
            });
          } finally {
            setIsConverting(false);
            setProgress(0);
          }
        } else {
          toast({
            title: "Invalid file type",
            description: "Please upload a PDF, DOC, DOCX, or TXT file",
            variant: "destructive",
          });
        }
      }
    },
    [toast, setLocation, setIsConverting, setProgress, queryClient, hasReachedLimit, selectedCategory],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
        ".docx",
      ],
    },
    multiple: false,
    disabled: hasReachedLimit,
  });

  const handleLimitReached = () => {
    setHasReachedLimit(true);
    setLocation("/billing");
  };

  const [openFaqs, setOpenFaqs] = useState<{ [key: string]: boolean }>({});

  const toggleFaq = (id: string) => {
    setOpenFaqs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const faqItems = [
    {
      id: "multipage",
      question: "Does it work with long documents?",
      answer: "Yes! Our service is optimized for documents of any length, including multi-page articles. The AI adapts the conversation naturally across all pages while maintaining context.",
    },
    {
      id: "formats",
      question: "What file formats are supported?",
      answer: "We currently support PDF, DOC, DOCX, and TXT files for conversion. All files are processed securely and confidentially.",
    },
    {
      id: "conversion-time",
      question: "How long does the conversion take?",
      answer: "Most articles are converted within 1-2 minutes, depending on length. Longer articles may take additional time to process.",
    },
    {
      id: "voice-customization",
      question: "Can I customize the voice?",
      answer: "Yes! Premium users can choose from multiple natural-sounding voices and adjust speech parameters like speed and tone.",
    },
    {
      id: "podcast-location",
      question: "Where can I find my converted podcasts?",
      answer: "All your converted podcasts are available in your Library. You can stream them online or download for offline listening.",
    },
    {
      id: "usage-limit",
      question: "What happens if I reach my usage limit?",
      answer: "When you reach your plan's limit, you can upgrade to a higher tier to continue converting articles or wait until your usage resets next month.",
    },
  ];

  if (user) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 pt-16 md:pt-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold mb-2">
              Transform Your Articles Into Podcasts
            </h1>
            <p className="text-gray-400 text-sm">
              Upload any article and convert it into a natural-sounding podcast in seconds
            </p>
          </div>

          {user && (
            <div className="mb-6">
              <UsageProgress
                showUpgradeButton={true}
                onLimitReached={handleLimitReached}
              />
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Step 1: Select Category</h2>
            <div className="max-w-xl mx-auto bg-gray-900/50 p-6 rounded-lg border border-red-500">
              <p className="text-red-500 text-sm mb-2">Please select a category to continue</p>
              <Select
                required
                onValueChange={(value) => {
                  if (!value) return;
                  setSelectedCategory(value);
                  fetch('/api/set-category', {
                    method: 'POST',
                    body: JSON.stringify({ category: value }),
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select podcast category (required)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="kids">Kids</SelectItem>
                  <SelectItem value="research">Research</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Step 2: Upload Your Article</h2>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 mb-6 transition-colors 
              ${
                hasReachedLimit
                  ? "opacity-50 cursor-not-allowed border-gray-700 hover:border-gray-700"
                  : isDragActive
                  ? "border-[#4CAF50] bg-[#4CAF50]/10"
                  : "border-gray-700 hover:border-[#4CAF50]"
              } 
              bg-gray-900/50`}
          >
            <input {...getInputProps()} disabled={hasReachedLimit} />
            <div className="text-center">
              <Button
                size="lg"
                variant="default"
                disabled={hasReachedLimit}
                className={`mb-4 px-8 ${
                  !hasReachedLimit ? "bg-[#4CAF50] hover:bg-[#45a049]" : "opacity-50 cursor-not-allowed"
                }`}
                onClick={(e) => {
                  if (hasReachedLimit) {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocation("/billing");
                  }
                }}
              >
                Choose File to Upload
              </Button>
              <p className="text-gray-400">
                {hasReachedLimit
                  ? "Please upgrade your plan to continue converting articles"
                  : "or drag and drop your file here"}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Supported formats: PDF, DOC, DOCX, TXT
              </p>
              <p className="text-xs text-gray-500 mt-2">
                ** Please Upload articles greater than 1 page for an effective podcast conversion
              </p>
            </div>
          </div>

          {isConverting && (
            <div className="w-full bg-gray-900 rounded-lg p-4 mb-12">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">
                  Converting to podcast...
                </span>
                <span className="text-sm text-gray-400">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-[#4CAF50] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="bg-gray-900/50 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {faqItems.map((faq) => (
                <Collapsible
                  key={faq.id}
                  open={openFaqs[faq.id]}
                  onOpenChange={() => toggleFaq(faq.id)}
                  className="border border-gray-800 rounded-lg"
                >
                  <CollapsibleTrigger className="flex justify-between items-center w-full p-4 text-left">
                    <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                    {openFaqs[faq.id] ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="p-4 pt-0">
                    <p className="text-gray-400">{faq.answer}</p>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="relative flex justify-between items-center p-4 md:p-6">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div className="hidden md:flex items-center gap-4">
          <Button variant="ghost">Home</Button>
          <Button variant="ghost" onClick={() => setLocation("/library")}>
            Library
          </Button>
          <Button variant="ghost" onClick={() => setLocation("/pricing")}>
            Pricing
          </Button>
          <Button variant="outline" onClick={() => setLocation("/auth/signup")}>
            Sign Up
          </Button>
          <Button onClick={() => setLocation("/auth")}>Login</Button>
        </div>
        {isMobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="absolute top-full right-4 w-48 py-2 mt-2 bg-background border rounded-lg shadow-lg z-50 md:hidden">
              <Button
                variant="ghost"
                className="w-full justify-start px-4"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start px-4"
                onClick={() => {
                  setLocation("/library");
                  setIsMobileMenuOpen(false);
                }}
              >
                Library
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start px-4"
                onClick={() => {
                  setLocation("/pricing");
                  setIsMobileMenuOpen(false);
                }}
              >
                Pricing
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start px-4"
                onClick={() => {
                  setLocation("/auth/signup");
                  setIsMobileMenuOpen(false);
                }}
              >
                Sign Up
              </Button>
              <Button
                variant="default"
                className="w-full justify-start px-4"
                onClick={() => {
                  setLocation("/auth");
                  setIsMobileMenuOpen(false);
                }}
              >
                Login
              </Button>
            </div>
          </>
        )}
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12 md:mb-24 px-4">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-[#4CAF50] to-emerald-400 bg-clip-text text-transparent">
            Transform Your Articles Into Engaging Podcasts
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-8 md:mb-12 max-w-2xl mx-auto">
            Convert any article into a professional, natural-sounding podcast in
            seconds with our AI-powered platform
          </p>
          <div className="flex flex-col md:flex-row justify-center gap-4">
            <Button
              size="lg"
              onClick={() => setLocation("/auth")}
              className="bg-[#4CAF50] hover:bg-[#45a049] text-lg px-8 w-full md:w-auto"
            >
              Get Started Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setLocation("/pricing")}
              className="text-lg px-8 w-full md:w-auto"
            >
              View Pricing
            </Button>
          </div>
        </div>
        <div className="text-center mb-12 md:mb-24 px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-12">
            <div className="p-4 md:p-6">
              <h3 className="text-3xl md:text-4xl font-bold text-[#4CAF50] mb-2">
                100K+
              </h3>
              <p className="text-gray-400">Articles Converted</p>
            </div>
            <div className="p-4 md:p-6">
              <h3 className="text-3xl md:text-4xl font-bold text-[#4CAF50] mb-2">
                50K+
              </h3>
              <p className="text-gray-400">Active Users</p>
            </div>
            <div className="p-4 md:p-6">
              <h3 className="text-3xl md:text-4xl font-bold text-[#4CAF50] mb-2">
                4.9/5
              </h3>
              <p className="text-gray-400">User Rating</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 md:gap-8">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"
              alt="Amazon"
              className="h-6 md:h-8 opacity-50 hover:opacity-75 transition-opacity"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg"
              alt="Google"
              className="h-6 md:h-8 opacity-50 hover:opacity-75 transition-opacity"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg"
              alt="Netflix"
              className="h-6 md:h-8 opacity-50 hover:opacity-75 transition-opacity"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg"
              alt="Microsoft"
              className="h-6 md:h-8 opacity-50 hover:opacity-75 transition-opacity"
            />
          </div>
        </div>
        <div className="mb-12 md:mb-24 px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8 md:mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
            <div className="p-6 md:p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
              <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-4 md:mb-6 mx-auto">
                <FileText className="w-8 h-8 text-[#4CAF50]" />
              </div>
              <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">
                1. Upload Your Article
              </h3>
              <p className="text-sm md:text-base text-gray-400">
                Simply upload your article in any format (PDF, DOC, TXT) and let
                our AI do the magic
              </p>
            </div>
            <div className="p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
              <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-6 mx-auto">
                <Upload className="w-8 h-8 text-[#4CAF50]" />
              </div>
              <h3 className="text-xl font-semibold mb-4">2. Choose Voice</h3>
              <p className="text-gray-400">
                Select from our library of natural-sounding voices to match your
                content's tone
              </p>
            </div>
            <div className="p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
              <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-6 mx-auto">
                <Headphones className="w-8 h-8 text-[#4CAF50]" />
              </div>
              <h3 className="text-xl font-semibold mb-4">
                3. Get Your Podcast
              </h3>
              <p className="text-gray-400">
                Download or stream your professionally converted podcast
                instantly
              </p>
            </div>
          </div>
        </div>
        <div className="text-center mb-24 bg-gradient-to-r from-[#4CAF50]/20 to-emerald-500/20 rounded-xl p-12">
          <h2 className="text-4xl font-bold mb-6">
            Ready to Transform Your Content?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of content creators who are already using Podify to
            reach their audience in new ways.
          </p>
          <Button
            size="lg"
            onClick={() => setLocation("/auth")}
            className="bg-[#4CAF50] hover:bg-[#45a049] text-lg px-12"
          >
            Start Creating Now
          </Button>
        </div>
        <footer className="text-center text-sm text-gray-500">
          <p>© 2024 Podcastify. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}