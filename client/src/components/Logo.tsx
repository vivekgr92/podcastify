import React from "react";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Gradient Definitions */}
          <defs>
            {/* Gradient for headphones and Podify */}
            <linearGradient
              id="headphoneGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" style={{ stopColor: "#34D399" }} />{" "}
              {/* Light green */}
              <stop offset="100%" style={{ stopColor: "#10B981" }} />{" "}
              {/* Dark green */}
            </linearGradient>

            {/* Optional Waveform Gradient */}
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: "#FFFFFF" }} />{" "}
              {/* White */}
              <stop offset="100%" style={{ stopColor: "#E5E7EB" }} />{" "}
              {/* Light gray */}
            </linearGradient>
          </defs>

          {/* Headphones */}
          <path
            d="M20,50 C20,30 35,15 50,15 C65,15 80,30 80,50 L80,70 C80,75 75,80 70,80 L65,80 C60,80 55,75 55,70 L55,60 C55,55 60,50 65,50 L80,50 M20,50 L35,50 C40,50 45,55 45,60 L45,70 C45,75 40,80 35,80 L30,80 C25,80 20,75 20,70 L20,50"
            fill="none"
            stroke="url(#headphoneGradient)" // Matches "Podify" gradient
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* Waveform */}
          {[40, 45, 50, 55, 60].map((x, i) => (
            <rect
              key={i}
              x={x}
              y={50 - (i % 2 === 0 ? 10 : 15)}
              width="2"
              height={i % 2 === 0 ? 20 : 30}
              fill="url(#waveGradient)" // White gradient for the waveform
              opacity="0.9"
            />
          ))}
        </svg>
      </div>
      <span className="font-bold text-xl bg-gradient-to-r from-green-400 to-green-500 bg-clip-text text-transparent">
        Podify
      </span>
    </div>
  );
}
