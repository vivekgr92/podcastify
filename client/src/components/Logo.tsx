
import React from "react";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Background gradient for headphones */}
          <defs>
            <linearGradient id="headphoneGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: "#60A5FA" }} />
              <stop offset="100%" style={{ stopColor: "#EC4899" }} />
            </linearGradient>
            {/* Sound wave gradient */}
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: "#8B5CF6" }} />
              <stop offset="100%" style={{ stopColor: "#6366F1" }} />
            </linearGradient>
          </defs>

          {/* Headphone shape */}
          <path
            d="M20,50 C20,30 35,15 50,15 C65,15 80,30 80,50 L80,70 C80,75 75,80 70,80 L65,80 C60,80 55,75 55,70 L55,60 C55,55 60,50 65,50 L80,50 M20,50 L35,50 C40,50 45,55 45,60 L45,70 C45,75 40,80 35,80 L30,80 C25,80 20,75 20,70 L20,50"
            fill="none"
            stroke="url(#headphoneGradient)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Sound waves */}
          {[35, 45, 55, 65].map((x, i) => (
            <rect
              key={i}
              x={x}
              y="40"
              width="2"
              height="20"
              fill="url(#waveGradient)"
              opacity="0.6"
            />
          ))}
        </svg>
      </div>
      <span className="font-bold text-xl bg-gradient-to-r from-blue-400 to-pink-500 bg-clip-text text-transparent">
        Podify
      </span>
    </div>
  );
}
