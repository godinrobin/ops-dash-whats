import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { Button } from "@/components/ui/button";
import { LogOut, User, Shield, LayoutGrid, ShoppingBag, Megaphone, Menu, Settings } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { ProfileModal } from "./ProfileModal";
import { cn } from "@/lib/utils";

export type AppMode = "sistemas" | "marketplace" | "ads";

interface HeaderProps {
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
  onSidebarToggle?: () => void;
}

export const Header = ({ mode, onModeChange, onSidebarToggle }: HeaderProps) => {
  const { signOut } = useAuth();
  const { isAdmin } = useAdminStatus();
  const { isImpersonating } = useImpersonation();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  
  const isOnHomePage = location.pathname === "/";
  const isOnAuthPage = location.pathname === "/auth";
  const isInAdsSection = location.pathname.startsWith("/ads");
  
  const showSidebarToggle = !isOnAuthPage && !isInAdsSection;
  const showModeToggle = (isOnHomePage || isInAdsSection) && mode && onModeChange;

  const headerTopClass = isImpersonating ? "top-10" : "top-0";

  return (
    <>
      <header className={cn(
        "fixed left-0 right-0 h-14 bg-card border-b border-border z-50",
        headerTopClass
      )}>
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left section */}
          <div className="flex items-center gap-3">
            {showSidebarToggle && onSidebarToggle && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onSidebarToggle}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            
            <button 
              onClick={() => navigate("/")} 
              className="flex items-center gap-2 group"
            >
              <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
                <span className="text-accent-foreground font-bold text-sm">Z</span>
              </div>
              <span className="font-semibold text-accent group-hover:text-accent/80 transition-colors hidden sm:block">
                Zapdata
              </span>
            </button>
          </div>

          {/* Center - Mode Toggle */}
          {showModeToggle && (
            <div className="flex items-center bg-secondary rounded-lg p-1">
              <button
                onClick={() => onModeChange("sistemas")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === "sistemas" 
                    ? "bg-accent text-accent-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </button>
              <button
                onClick={() => onModeChange("marketplace")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === "marketplace" 
                    ? "bg-accent text-accent-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Marketplace</span>
              </button>
              <button
                onClick={() => onModeChange("ads")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === "ads" 
                    ? "bg-accent text-accent-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Megaphone className="h-4 w-4" />
                <span className="hidden sm:inline">ADS</span>
              </button>
            </div>
          )}

          {/* Right section - Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setProfileOpen(true)}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>

            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin-panel")}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};