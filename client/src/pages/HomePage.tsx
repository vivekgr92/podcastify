import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTTS } from "../hooks/use-tts";
import { FileText, Upload, Headphones, Play } from "lucide-react";
import { useDropzone } from "react-dropzone";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { convertToSpeech, isConverting } = useTTS();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      if (["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) {
        setFile(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOC, DOCX, or TXT file",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

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
          <Button variant="ghost">Library</Button>
          <Button variant="ghost">About</Button>
          <Button variant="outline">Sign Up</Button>
          <Button>Login</Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-bold mb-4">Transform Your Articles Into Podcasts</h1>
        <p className="text-gray-400 mb-12">Upload any article and convert it into a natural-sounding podcast in seconds</p>

        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-12 mb-12 transition-colors
            ${isDragActive ? 'border-[#4CAF50] bg-[#4CAF50]/10' : 'border-gray-700 hover:border-[#4CAF50]'}`}
        >
          <input {...getInputProps()} />
          <Button variant="outline" className="mb-4">Choose File to Upload</Button>
          <p className="text-sm text-gray-400">or drag and drop your file here</p>
          <p className="text-xs text-gray-500 mt-2">Supported formats: PDF, DOC, DOCX, TXT</p>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-16">
          <div className="p-6 rounded-lg bg-gray-900">
            <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-4 mx-auto">
              <FileText className="w-6 h-6 text-[#4CAF50]" />
            </div>
            <h3 className="font-semibold mb-2">1. Upload Your Article</h3>
            <p className="text-sm text-gray-400">Select any article you'd like to convert into audio format</p>
          </div>

          <div className="p-6 rounded-lg bg-gray-900">
            <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-4 mx-auto">
              <Upload className="w-6 h-6 text-[#4CAF50]" />
            </div>
            <h3 className="font-semibold mb-2">2. Choose Voice</h3>
            <p className="text-sm text-gray-400">Select from multiple natural-sounding voices</p>
          </div>

          <div className="p-6 rounded-lg bg-gray-900">
            <div className="w-12 h-12 rounded-full bg-[#4CAF50]/20 flex items-center justify-center mb-4 mx-auto">
              <Headphones className="w-6 h-6 text-[#4CAF50]" />
            </div>
            <h3 className="font-semibold mb-2">3. Get Your Podcast</h3>
            <p className="text-sm text-gray-400">Download or stream your converted podcast</p>
          </div>
        </div>

        <section className="text-left">
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
      </main>

      <footer className="border-t border-gray-800 mt-16 py-6 text-center text-sm text-gray-500">
        <div className="max-w-4xl mx-auto px-6 flex justify-between">
          <p>© 2024 Podcastify. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-400">Terms</a>
            <a href="#" className="hover:text-gray-400">Privacy</a>
            <a href="#" className="hover:text-gray-400">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
