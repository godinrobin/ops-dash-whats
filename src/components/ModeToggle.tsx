import { LayoutGrid, ShoppingBag, Megaphone } from "lucide-react";
import { GlassFilter } from "@/components/ui/liquid-radio";

interface ModeToggleProps {
  mode: "sistemas" | "marketplace" | "ads";
  onModeChange: (mode: "sistemas" | "marketplace" | "ads") => void;
}

export const ModeToggle = ({ mode, onModeChange }: ModeToggleProps) => {
  return (
    <>
      <GlassFilter />
      <div 
        className="relative flex items-center bg-secondary/50 rounded-lg p-1 border border-border/50"
        style={{ filter: "url(#radio-glass)" }}
      >
        <button
          onClick={() => onModeChange("sistemas")}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300
            ${mode === "sistemas" 
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-lg shadow-blue-500/20" 
              : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </button>
        <button
          onClick={() => onModeChange("marketplace")}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300
            ${mode === "marketplace" 
              ? "bg-accent/20 text-accent border border-accent/50 shadow-lg shadow-accent/20" 
              : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          <ShoppingBag className="h-4 w-4" />
          <span className="hidden sm:inline">Marketplace</span>
        </button>
        <button
          onClick={() => onModeChange("ads")}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-300
            ${mode === "ads" 
              ? "bg-orange-500/20 text-orange-400 border border-orange-500/50 shadow-lg shadow-orange-500/20" 
              : "text-muted-foreground hover:text-foreground"
            }
          `}
        >
          <Megaphone className="h-4 w-4" />
          <span className="hidden sm:inline">ADS</span>
        </button>
      </div>
    </>
  );
};
