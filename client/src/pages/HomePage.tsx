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
          // Reset states and cleanup existing EventSource
          const cleanupExistingSource = () => {
            if (eventSource) {
              if (eventSource.readyState !== EventSource.CLOSED) {
                console.log('Closing existing EventSource connection');
                eventSource.close();
              }
              setEventSource(null);
            }
          };

          cleanupExistingSource();
          setConversionProgress(0);
          setIsConverting(true);
          
          // Create new EventSource for progress tracking
          console.log('Initializing new EventSource connection');
          const source = new EventSource('/api/podcast/progress', { 
            withCredentials: true 
          });

          // Track connection state and retries
          let isConnected = false;
          let retryCount = 0;
          const MAX_RETRIES = 3;
          
          const setupConnection = () => {
            // Set initial connection timeout
            const connectionTimeout = setTimeout(() => {
              if (source.readyState !== EventSource.OPEN) {
                console.error('EventSource connection timeout');
                if (retryCount < MAX_RETRIES) {
                  retryCount++;
                  console.log(`Retrying connection (${retryCount}/${MAX_RETRIES})`);
                  source.close();
                  setupConnection();
                } else {
                  handleError(source, "Failed to establish connection after multiple attempts");
                }
              }
            }, 5000);

            source.onopen = () => {
              console.log('Progress tracking connected');
              isConnected = true;
              retryCount = 0;
              setConversionProgress(1);
              clearTimeout(connectionTimeout);
            };

            source.onmessage = (event) => {
              try {
                if (!event.data) {
                  console.warn('Received empty event data');
                  return;
                }

                let data;
                try {
                  data = JSON.parse(event.data);
                } catch (parseError) {
                  console.error('Failed to parse event data:', event.data, parseError);
                  return;
                }

                console.log('Progress update:', data);
                
                if (data && typeof data.progress === 'number') {
                  const progress = Math.min(Math.round(data.progress), 100);
                  setConversionProgress(progress);
                  
                  if (progress >= 100 || data.status === 'completed') {
                    console.log('Conversion completed');
                    source.close();
                    setEventSource(null);
                    // Keep 100% visible briefly before resetting
                    setTimeout(() => {
                      setIsConverting(false);
                      setConversionProgress(0);
                    }, 1500);
                  }
                }
              } catch (error) {
                console.error('Progress handling error:', error);
                if (retryCount < MAX_RETRIES) {
                  retryCount++;
                  console.log(`Retrying after error (${retryCount}/${MAX_RETRIES})`);
                  source.close();
                  setupConnection();
                } else {
                  handleError(source, "Error processing progress updates");
                }
              }
            };

            source.onerror = (error) => {
              console.error('Progress tracking error:', error);
              
              if (isConnected) {
                toast({
                  title: "Warning",
                  description: "Progress tracking connection lost. Attempting to reconnect...",
                  variant: "destructive",
                });
              }
              
              if (source.readyState === EventSource.CLOSED) {
                if (retryCount < MAX_RETRIES) {
                  retryCount++;
                  console.log(`Retrying after error (${retryCount}/${MAX_RETRIES})`);
                  setTimeout(() => setupConnection(), 1000 * retryCount);
                } else {
                  handleError(source, "Connection lost after multiple retry attempts");
                }
              }
            };
          };

          setupConnection();
          
          source.onerror = (error: Event) => {
            console.error('Progress tracking error:', error);
            
            // Only show error if we were previously connected
            if (isConnected) {
              toast({
                title: "Warning",
                description: "Progress tracking connection lost. Trying to reconnect...",
                variant: "destructive",
              });
            }
            
            // If the connection is closed (not just temporarily disconnected)
            if (source.readyState === EventSource.CLOSED) {
              console.log('EventSource connection closed');
              isConnected = false;
              source.close();
              setEventSource(null);
              setIsConverting(false);
              
              toast({
                title: "Error",
                description: "Lost connection to progress tracker. Please try again.",
                variant: "destructive",
              });
            }
          };
          
          setEventSource(source);
          
          // Helper function to handle errors
          const handleError = (source: EventSource, message: string) => {
            console.log('Handling error:', message);
            if (source && source.readyState !== EventSource.CLOSED) {
              source.close();
            }
            setEventSource(null);
            setIsConverting(false);
            setConversionProgress(0);
            toast({
              title: "Error",
              description: message,
              variant: "destructive",
            });
          };

          // Cleanup function for component unmount
          const cleanup = () => {
            if (source && source.readyState !== EventSource.CLOSED) {
              console.log('Cleaning up EventSource connection');
              source.close();
            }
          };

          // Add cleanup to component unmount
          useEffect(() => {
            return cleanup;
          }, []);

          try {
            const response = await fetch('/api/podcast', {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
            
            if (!response.ok) {
              const errorData = await response.text();
              throw new Error(errorData || 'Failed to convert file');
            }
            
            const podcast = await response.json();
            console.log('Conversion successful:', podcast);
            
            // Wait for progress to reach 100%
            const result = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Conversion timed out'));
              }, 300000); // 5 minute timeout
              
              const checkProgress = setInterval(() => {
                if (conversionProgress >= 100) {
                  clearInterval(checkProgress);
                  clearTimeout(timeout);
                  resolve(true);
                }
              }, 100);
            });
            
            toast({
              title: "Success",
              description: "Your file has been converted successfully!",
            });
            
            await queryClient.invalidateQueries({ queryKey: ['podcasts'] });
            setLocation('/library');
          } catch (error) {
            console.error('File conversion error:', error);
            handleError(source, error instanceof Error ? error.message : "Failed to convert your file. Please try again.");
          }
        } catch (error) {
          console.error('File upload error:', error);
          toast({
            title: "Error",
            description: "Failed to upload your file. Please try again.",
            variant: "destructive",
          });
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
              <div className="w-full bg-gray-900/95 backdrop-blur-lg rounded-xl p-8 mb-12 shadow-2xl border border-gray-800">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#4CAF50] border-t-transparent"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-[#4CAF50] animate-pulse"></div>
                      </div>
                    </div>
                    <div>
                      <span className="text-xl font-semibold text-white block">
                        {conversionProgress === 0 
                          ? "Preparing your podcast..." 
                          : conversionProgress < 30
                          ? "Analyzing content..."
                          : conversionProgress < 60
                          ? "Converting to speech..."
                          : conversionProgress < 90
                          ? "Processing audio..."
                          : "Finalizing..."}
                      </span>
                      <span className="text-sm text-gray-400">Please don't close this window</span>
                    </div>
                  </div>
                  <div className="bg-[#4CAF50]/10 px-6 py-3 rounded-full border border-[#4CAF50]/20">
                    <span className="text-3xl text-[#4CAF50] font-bold tracking-wider">
                      {conversionProgress}%
                    </span>
                  </div>
                </div>
                <div className="relative w-full bg-gray-800/50 rounded-full h-4 overflow-hidden">
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-[#4CAF50]/20 via-[#4CAF50]/10 to-transparent animate-pulse"
                    style={{ transform: 'translateX(-50%)' }}
                  />
                  <div 
                    className="relative h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-[#4CAF50] via-emerald-400 to-[#4CAF50]"
                    style={{ 
                      width: `${conversionProgress}%`,
                      backgroundSize: '200% 100%',
                      animation: 'gradient 2s linear infinite'
                    }}
                  >
                    <div className="absolute right-0 top-0 h-full w-4 bg-white/20 blur-sm" />
                  </div>
                </div>
                <p className="text-sm text-gray-300 mt-4 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#4CAF50] animate-pulse"></span>
                  {conversionProgress === 0 
                    ? "Initializing conversion process..."
                    : conversionProgress < 30 
                    ? "Analyzing article content..."
                    : conversionProgress < 60 
                    ? "Converting text to speech..."
                    : conversionProgress < 90 
                    ? "Processing audio..."
                    : "Almost done..."}
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