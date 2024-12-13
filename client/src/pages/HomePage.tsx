import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTTS } from "../hooks/use-tts";
import { FileText, Upload, Headphones, Play, Plus } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../hooks/use-user";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { convertToSpeech, isConverting, setIsConverting, progress, setProgress } = useTTS();
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      if (file.type === "text/plain" || file.type === "application/pdf") {
        setFile(file);
        
        // Create form data and append file
        const formData = new FormData();
        formData.append('file', file);
        
        try {
          // Reset progress and start conversion
          setProgress(0);
          setIsConverting(true);
          
          console.log('Starting file conversion...');
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
          
          toast({
            title: "Success",
            description: "Your file has been converted successfully!",
          });
          
          // Invalidate podcasts query to refresh library
          await queryClient.invalidateQueries({ queryKey: ['podcasts'] });
          
          // Redirect to library to see the converted podcast
          setLocation('/library');
        } catch (error) {
          console.error('File conversion error:', error);
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
  }, [toast, setLocation, setIsConverting, setProgress, queryClient]);

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

        {/* Features Section */}
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

        {/* File Upload Section (for authenticated users) */}
        {user && (
          <div className="space-y-4 mb-24">
            <h2 className="text-3xl font-bold text-center mb-8">Start Converting</h2>
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-lg p-12 transition-colors
                ${isDragActive ? 'border-[#4CAF50] bg-[#4CAF50]/10' : 'border-gray-700 hover:border-[#4CAF50]'}`}
            >
              <input {...getInputProps()} />
              <Button size="lg" className="mb-4">Choose File to Upload</Button>
              <p className="text-sm text-gray-400">or drag and drop your file here</p>
              <p className="text-xs text-gray-500 mt-2">Supported formats: PDF, DOC, DOCX, TXT</p>
            </div>
            
            {isConverting && (
              <div className="w-full bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Converting to podcast...</span>
                  <span className="text-sm text-gray-400">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-[#4CAF50] h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Testimonials */}
        <div className="mb-24">
          <h2 className="text-3xl font-bold text-center mb-12">What Our Users Say</h2>
          <div className="grid grid-cols-3 gap-8">
            <div className="p-8 rounded-lg bg-gray-900">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mr-4">
                  <span className="text-xl font-bold text-[#4CAF50]">J</span>
                </div>
                <div>
                  <h4 className="font-semibold">John Smith</h4>
                  <p className="text-sm text-gray-400">Content Creator</p>
                </div>
              </div>
              <p className="text-gray-300">"Podcastify has revolutionized how I create content. The voice quality is amazing, and it saves me hours of work!"</p>
            </div>
            
            <div className="p-8 rounded-lg bg-gray-900">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mr-4">
                  <span className="text-xl font-bold text-[#4CAF50]">S</span>
                </div>
                <div>
                  <h4 className="font-semibold">Sarah Johnson</h4>
                  <p className="text-sm text-gray-400">Digital Marketer</p>
                </div>
              </div>
              <p className="text-gray-300">"The natural-sounding voices and seamless conversion process make this tool indispensable for my content strategy."</p>
            </div>
            
            <div className="p-8 rounded-lg bg-gray-900">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mr-4">
                  <span className="text-xl font-bold text-[#4CAF50]">M</span>
                </div>
                <div>
                  <h4 className="font-semibold">Michael Chen</h4>
                  <p className="text-sm text-gray-400">Tech Blogger</p>
                </div>
              </div>
              <p className="text-gray-300">"Finally, a tool that understands the nuances of technical content. The AI voices sound incredibly natural!"</p>
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

        {/* Recent Conversions (only shown to authenticated users) */}
        {user && (
          <section className="text-left mb-24">
            <h2 className="text-xl font-semibold mb-4">Recent Conversions</h2>
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-800 rounded"></div>
                <div>
                  <h3 className="font-medium">Sample Article Title</h3>
                  <p className="text-sm text-gray-400">3:45 minutes • Converted 2 hours ago</p>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto">
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-16 py-12 text-center text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-8 mb-8 text-left">
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Use Cases</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#" className="hover:text-white">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Resources</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white">Documentation</a></li>
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Tutorials</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white">Privacy</a></li>
                <li><a href="#" className="hover:text-white">Terms</a></li>
                <li><a href="#" className="hover:text-white">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex justify-between items-center">
            <p>© 2024 Podcastify. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white">Twitter</a>
              <a href="#" className="hover:text-white">LinkedIn</a>
              <a href="#" className="hover:text-white">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
