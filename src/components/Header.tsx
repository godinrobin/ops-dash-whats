import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LogOut, ArrowLeft, User, Shield, Settings } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { ProfileModal } from "./ProfileModal";

export const Header = () => {
  const { signOut } = useAuth();
  const { isAdmin } = useAdminStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  
  const showBackButton = location.pathname !== "/" && location.pathname !== "/auth";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-b border-border z-50">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-xl font-bold bg-gradient-to-r from-accent to-orange-400 bg-clip-text text-transparent">Zapdata</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Perfil</span>
            </Button>
            
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 text-accent"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-accent">
                  <DropdownMenuItem onClick={() => navigate("/admin-panel")}>
                    <Settings className="h-4 w-4 mr-2" />
                    Painel Administrativo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};
