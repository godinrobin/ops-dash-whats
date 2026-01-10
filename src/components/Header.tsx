import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, ArrowLeft, User, Shield, Settings, LayoutGrid, ShoppingBag, Megaphone } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { ProfileModal } from "./ProfileModal";
import Dock from "@/components/ui/dock";
import { AnimatedText } from "@/components/ui/animated-shiny-text";
import { motion } from "framer-motion";

export type AppMode = "sistemas" | "marketplace" | "ads";

interface HeaderProps {
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
}

export const Header = ({ mode, onModeChange }: HeaderProps) => {
  const { signOut } = useAuth();
  const { isAdmin } = useAdminStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  
  const showBackButton = location.pathname !== "/" && location.pathname !== "/auth" && !location.pathname.startsWith("/ads");
  const isInAdsSection = location.pathname.startsWith("/ads");
  const showModeToggle = (location.pathname === "/" || isInAdsSection) && mode && onModeChange;

  const dockItems = [
    { 
      icon: User, 
      label: "Perfil", 
      onClick: () => setProfileOpen(true),
      active: false
    },
    ...(isAdmin ? [{
      icon: Shield,
      label: "Admin",
      onClick: () => navigate("/admin-panel"),
      active: false
    }] : []),
    {
      icon: LogOut,
      label: "Sair",
      onClick: signOut,
      active: false
    }
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-b border-border z-50">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </motion.div>
            )}
            <button onClick={() => navigate("/")} className="focus:outline-none">
              <AnimatedText 
                text="Zapdata" 
                gradientColors="linear-gradient(90deg, hsl(var(--accent)), hsl(35 100% 60%), hsl(var(--accent)))"
                gradientAnimationDuration={2}
                textClassName="text-xl font-bold cursor-pointer hover:opacity-80 transition-opacity"
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            {showModeToggle && (
              <div className="flex items-center bg-secondary/50 rounded-lg p-1 border border-border/50 mr-2">
                <motion.button
                  onClick={() => onModeChange("sistemas")}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
                    ${mode === "sistemas" 
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" 
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sistemas</span>
                </motion.button>
                <motion.button
                  onClick={() => onModeChange("marketplace")}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
                    ${mode === "marketplace" 
                      ? "bg-accent/20 text-accent border border-accent/50" 
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Marketplace</span>
                </motion.button>
                <motion.button
                  onClick={() => onModeChange("ads")}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
                    ${mode === "ads" 
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/50" 
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">ADS</span>
                </motion.button>
              </div>
            )}

            <Dock items={dockItems} />
          </div>
        </div>
      </header>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};
