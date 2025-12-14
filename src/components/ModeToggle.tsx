import { LayoutGrid, ShoppingBag } from "lucide-react";

interface ModeToggleProps {
  mode: "sistemas" | "marketplace";
  onModeChange: (mode: "sistemas" | "marketplace") => void;
}

export const ModeToggle = ({ mode, onModeChange }: ModeToggleProps) => {
  return (
    <div className="flex items-center bg-secondary/50 rounded-lg p-1 border border-border/50">
      <button
        onClick={() => onModeChange("sistemas")}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${mode === "sistemas" 
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" 
            : "text-muted-foreground hover:text-foreground"
          }
        `}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Sistemas</span>
      </button>
      <button
        onClick={() => onModeChange("marketplace")}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${mode === "marketplace" 
            ? "bg-accent/20 text-accent border border-accent/50" 
            : "text-muted-foreground hover:text-foreground"
          }
        `}
      >
        <ShoppingBag className="h-4 w-4" />
        <span className="hidden sm:inline">Marketplace</span>
      </button>
    </div>
  );
};