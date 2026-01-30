import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Flame, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface PopularSystem {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
  tag?: string;
}

const popularSystems: PopularSystem[] = [
  { id: "automatizap", path: "/inbox", title: "Automati-Zap", icon: <Zap className="w-4 h-4" />, tag: "Bot" },
  { id: "maturador", path: "/maturador", title: "Maturador", icon: <Flame className="w-4 h-4" /> },
  { id: "audio", path: "/gerador-audio", title: "Gerador de Áudios", icon: <Mic className="w-4 h-4" /> },
];

export const PopularSystemsMarquee = () => {
  const navigate = useNavigate();
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Duplicate items for seamless loop
  const items = [...popularSystems, ...popularSystems, ...popularSystems];

  return (
    <div 
      className="w-full bg-accent/10 border-y border-accent/20 py-3 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div 
        ref={containerRef}
        className={cn(
          "flex gap-8 animate-marquee",
          isPaused && "animation-paused"
        )}
        style={{
          width: "max-content",
        }}
      >
        {items.map((system, index) => (
          <button
            key={`${system.id}-${index}`}
            onClick={() => navigate(system.path)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-background/80 border border-accent/30 hover:border-accent hover:bg-accent/10 transition-all cursor-pointer group whitespace-nowrap"
          >
            <span className="text-accent group-hover:scale-110 transition-transform">
              {system.icon}
            </span>
            <span className="text-sm font-medium text-foreground">{system.title}</span>
            {system.tag && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-semibold uppercase">
                {system.tag}
              </span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        
        .animate-marquee {
          animation: marquee 15s linear infinite;
        }
        
        .animation-paused {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};
