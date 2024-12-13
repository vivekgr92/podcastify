import { useCallback, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTTS } from "../hooks/use-tts";
import { FileText, Upload, Headphones, Play } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../hooks/use-user";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const { toast } = useToast();
  const { user } = useUser();

  // Cleanup EventSource on unmount or when conversion is complete
  useEffect(() => {
    return () => {
      if (eventSource) {
        console.log('Cleaning up EventSource');
        eventSource.close();
      }
    };
  }, [eventSource]);

  const { convertToSpeech } = useTTS();
  const queryClient = useQueryClient();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      if (file.type === "text/plain" || file.type === "application/pdf") {
        setFile(file);
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
          setConversionProgress(0);
          setIsConverting(true);
          
          console.log('Starting file conversion...');
          
          // Close any existing EventSource
          if (eventSource) {
            eventSource.close();
          }
          
          // Set up SSE for progress tracking with proper error handling and cleanup
          const newEventSource = new EventSource('/api/podcast/progress', { withCredentials: true });
          setEventSource(newEventSource);
          
          newEventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              console.log('Received progress data:', data);
              
              if (typeof data.progress === 'number') {
                const progress = Math.min(Math.round(data.progress), 100);
                setConversionProgress(progress);
                console.log('Setting progress:', progress);
                
                // Close EventSource when conversion is complete
                if (progress >= 100) {
                  console.log('Conversion complete, closing EventSource');
                  newEventSource.close();
                  setEventSource(null);
                  setIsConverting(false);
                }
              }
            } catch (error) {
              console.error('Error parsing progress data:', error);
              toast({
                title: "Error",
                description: "Error tracking conversion progress",
                variant: "destructive",
              });
            }
          };

          newEventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            // Only close and cleanup if we're not already in the process of conversion
            if (isConverting) {
              newEventSource.close();
              setEventSource(null);
              setIsConverting(false);
              setConversionProgress(0);
              toast({
                title: "Error",
                description: "Lost connection to conversion progress tracker",
                variant: "destructive",
              });
            }
          };

          // Add onopen handler to confirm connection
          newEventSource.onopen = () => {
            console.log('Progress tracking connected');
          };

          const response = await fetch('/api/podcast', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });
          
          if (!response.ok) {
            throw new Error('Failed to convert file');
          }
          
          const podcast = await response.json();
          console.log('Conversion successful:', podcast);
          setConversionProgress(100);
          
          toast({
            title: "Success",
            description: "Your file has been converted successfully!",
          });
          
          await queryClient.invalidateQueries({ queryKey: ['podcasts'] });
          setLocation('/library');
        } catch (error) {
          console.error('File conversion error:', error);
          toast({
            title: "Error",
            description: "Failed to convert your file. Please try again.",
            variant: "destructive",
          });
        } finally {
          if (eventSource) {
            eventSource.close();
            setEventSource(null);
          }
          setIsConverting(false);
          setConversionProgress(0);
          setFile(null);
        }
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, DOCX, or TXT file",
          variant: "destructive",
        });
      }
    }
  }, [toast, setLocation, queryClient, eventSource]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: false
  });

  const renderContent = () => {
    if (user) {
      return (
        <div className="min-h-screen bg-black text-white">
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold mb-4">Transform Your Articles Into Podcasts</h1>
              <p className="text-gray-400">Upload any article and convert it into a natural-sounding podcast in seconds</p>
            </div>

            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-16 mb-12 transition-colors bg-gray-900/50
                ${isDragActive ? 'border-[#4CAF50] bg-[#4CAF50]/10' : 'border-gray-700 hover:border-[#4CAF50]'}`}
            >
              <input {...getInputProps()} />
              <div className="text-center">
                <Button className="bg-[#4CAF50] hover:bg-[#45a049] mb-4 text-lg px-8 py-6">Choose File to Upload</Button>
                <p className="text-gray-400">or drag and drop your file here</p>
                <p className="text-xs text-gray-500 mt-2">Supported formats: PDF, DOC, DOCX, TXT</p>
              </div>
            </div>

            {isConverting && (
              <div className="w-full bg-gray-900 rounded-lg p-6 mb-12">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-3 border-[#4CAF50] border-t-transparent"></div>
                    <span className="text-base text-gray-300 font-medium">
                      {conversionProgress === 0 
                        ? "Preparing your podcast..." 
                        : conversionProgress < 100 
                        ? "Converting article to podcast" 
                        : "Finalizing your podcast..."}
                    </span>
                  </div>
                  <span className="text-lg text-[#4CAF50] font-bold">
                    {conversionProgress > 0 ? `${Math.round(conversionProgress)}%` : "0%"}
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                  <div 
                    className={`h-3 rounded-full transition-all duration-300 ease-out ${
                      conversionProgress === 0 
                        ? "bg-[#4CAF50]/30 animate-pulse w-full" 
                        : "bg-gradient-to-r from-[#4CAF50] to-emerald-400"
                    }`}
                    style={{ 
                      width: conversionProgress > 0 ? `${conversionProgress}%` : '100%',
                      transition: 'width 0.5s ease-out'
                    }}
                  />
                </div>
                <p className="text-sm text-gray-400 mt-3">
                  {conversionProgress > 0 && conversionProgress < 100 
                    ? "This may take a few minutes depending on the article length" 
                    : ""}
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-8 mb-12">
              <div className="text-center p-6 rounded-lg bg-gray-900/50">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#4CAF50] font-bold">1</span>
                </div>
                <h3 className="font-semibold mb-2">Upload Your Article</h3>
                <p className="text-sm text-gray-400">Select any article you'd like to convert into audio format</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gray-900/50">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#4CAF50] font-bold">2</span>
                </div>
                <h3 className="font-semibold mb-2">Choose Voice</h3>
                <p className="text-sm text-gray-400">Select from multiple natural-sounding voices</p>
              </div>
              <div className="text-center p-6 rounded-lg bg-gray-900/50">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-[#4CAF50] font-bold">3</span>
                </div>
                <h3 className="font-semibold mb-2">Get Your Podcast</h3>
                <p className="text-sm text-gray-400">Download or stream your converted podcast</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black text-white">
        <nav className="flex justify-between items-center p-6">
          <h1 className="text-xl font-bold text-[#4CAF50]">Podcastify</h1>
          <div className="flex gap-4">
            <Button variant="ghost">Home</Button>
            <Button variant="ghost" onClick={() => setLocation('/library')}>Library</Button>
            <Button variant="ghost" onClick={() => setLocation('/pricing')}>Pricing</Button>
            <Button variant="outline" onClick={() => setLocation('/auth/signup')}>Sign Up</Button>
            <Button onClick={() => setLocation('/auth')}>Login</Button>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-6 py-16">
          {/* Hero Section */}
          <div className="text-center mb-24">
            <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-[#4CAF50] to-emerald-400 bg-clip-text text-transparent">
              Transform Your Articles Into Engaging Podcasts
            </h1>
            <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto">
              Convert any article into a professional, natural-sounding podcast in seconds with our AI-powered platform
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                size="lg" 
                onClick={() => setLocation('/auth')}
                className="bg-[#4CAF50] hover:bg-[#45a049] text-lg px-8"
              >
                Get Started Free
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation('/pricing')}
                className="text-lg px-8"
              >
                View Pricing
              </Button>
            </div>
          </div>

          {/* Social Proof */}
          <div className="text-center mb-24">
            <div className="grid grid-cols-3 gap-8 mb-12">
              <div className="p-6">
                <h3 className="text-4xl font-bold text-[#4CAF50] mb-2">100K+</h3>
                <p className="text-gray-400">Articles Converted</p>
              </div>
              <div className="p-6">
                <h3 className="text-4xl font-bold text-[#4CAF50] mb-2">50K+</h3>
                <p className="text-gray-400">Active Users</p>
              </div>
              <div className="p-6">
                <h3 className="text-4xl font-bold text-[#4CAF50] mb-2">4.9/5</h3>
                <p className="text-gray-400">User Rating</p>
              </div>
            </div>
            <div className="flex justify-center gap-8">
              <img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg" alt="Amazon" className="h-8 opacity-50 hover:opacity-75 transition-opacity" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" alt="Google" className="h-8 opacity-50 hover:opacity-75 transition-opacity" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" alt="Netflix" className="h-8 opacity-50 hover:opacity-75 transition-opacity" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg" alt="Microsoft" className="h-8 opacity-50 hover:opacity-75 transition-opacity" />
            </div>
          </div>

          {/* Features */}
          <div className="mb-24">
            <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
            <div className="grid grid-cols-3 gap-8">
              <div className="p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-6 mx-auto">
                  <FileText className="w-8 h-8 text-[#4CAF50]" />
                </div>
                <h3 className="text-xl font-semibold mb-4">1. Upload Your Article</h3>
                <p className="text-gray-400">Simply upload your article in any format (PDF, DOC, TXT) and let our AI do the magic</p>
              </div>

              <div className="p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-6 mx-auto">
                  <Upload className="w-8 h-8 text-[#4CAF50]" />
                </div>
                <h3 className="text-xl font-semibold mb-4">2. Choose Voice</h3>
                <p className="text-gray-400">Select from our library of natural-sounding voices to match your content's tone</p>
              </div>

              <div className="p-8 rounded-lg bg-gray-900 transform hover:scale-105 transition-transform">
                <div className="w-16 h-16 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-6 mx-auto">
                  <Headphones className="w-8 h-8 text-[#4CAF50]" />
                </div>
                <h3 className="text-xl font-semibold mb-4">3. Get Your Podcast</h3>
                <p className="text-gray-400">Download or stream your professionally converted podcast instantly</p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center mb-24 bg-gradient-to-r from-[#4CAF50]/20 to-emerald-500/20 rounded-xl p-12">
            <h2 className="text-4xl font-bold mb-6">Ready to Transform Your Content?</h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join thousands of content creators who are already using Podcastify to reach their audience in new ways.
            </p>
            <Button 
              size="lg" 
              onClick={() => setLocation('/auth')}
              className="bg-[#4CAF50] hover:bg-[#45a049] text-lg px-12"
            >
              Start Creating Now
            </Button>
          </div>

          {/* Footer */}
          <footer className="text-center text-sm text-gray-500">
            <p>© 2024 Podcastify. All rights reserved.</p>
          </footer>
        </main>
      </div>
    );
  };

  return renderContent();
}