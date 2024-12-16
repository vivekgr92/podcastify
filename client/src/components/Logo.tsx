import { Headphones } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4CAF50] to-emerald-600 flex items-center justify-center">
        <Headphones className="w-5 h-5 text-white" />
      </div>
      <span className="font-bold text-xl bg-gradient-to-r from-[#4CAF50] to-emerald-400 bg-clip-text text-transparent">
        Podify
      </span>
    </div>
  );
}
