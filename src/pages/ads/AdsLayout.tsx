import { useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Header, AppMode } from "@/components/Header";
import { 
  LayoutDashboard, 
  Megaphone, 
  Bell, 
  MessageSquare, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import AdsDashboard from "./AdsDashboard";
import AdsCampaigns from "./AdsCampaigns";
import AdsAlerts from "./AdsAlerts";
import AdsTracker from "./AdsTracker";
import AdsSettings from "./AdsSettings";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  path: string;
  comingSoon?: boolean;
}

const sidebarItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/ads" },
  { icon: Megaphone, label: "Campanhas", path: "/ads/campaigns" },
  { icon: Bell, label: "Avisos", path: "/ads/alerts", comingSoon: true },
  { icon: MessageSquare, label: "Tracker WhatsApp", path: "/ads/tracker", comingSoon: true },
  { icon: Settings, label: "Configurações", path: "/ads/settings" },
];

export default function AdsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin } = useAdminStatus();

  const handleModeChange = (mode: AppMode) => {
    if (mode !== "ads") {
      navigate("/");
    }
  };

  const handleNavigation = (item: SidebarItem) => {
    if (item.comingSoon && !isAdmin) {
      return;
    }
    navigate(item.path);
  };

  return (
    <>
      <Header mode="ads" onModeChange={handleModeChange} />
      <div className="h-14 md:h-16" />
      
      <div className="flex min-h-[calc(100vh-56px)] md:min-h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 64 : 240 }}
          className="fixed left-0 top-14 md:top-16 h-[calc(100vh-56px)] md:h-[calc(100vh-64px)] bg-card border-r border-border z-40 flex flex-col"
        >
          <nav className="flex-1 py-4 px-2 space-y-1">
            {sidebarItems.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== "/ads" && location.pathname.startsWith(item.path));
              const isBlocked = item.comingSoon && !isAdmin;
              
              return (
                <motion.button
                  key={item.path}
                  onClick={() => handleNavigation(item)}
                  whileHover={{ scale: isBlocked ? 1 : 1.02 }}
                  whileTap={{ scale: isBlocked ? 1 : 0.98 }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                    isBlocked && "opacity-60 cursor-not-allowed",
                    isActive && !isBlocked
                      ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && !isBlocked && "text-orange-400")} />
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center gap-2 overflow-hidden"
                      >
                        <span
                          className={cn(
                            "text-sm font-medium whitespace-nowrap",
                            isActive && !isBlocked && "text-orange-400"
                          )}
                        >
                          {item.label}
                        </span>
                        {item.comingSoon && (
                          <Badge 
                            variant="outline" 
                            className="text-[9px] px-1.5 py-0 h-4 bg-orange-500/10 text-orange-400 border-orange-500/30 whitespace-nowrap"
                          >
                            <Clock className="h-2 w-2 mr-0.5" />
                            Em breve
                          </Badge>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </nav>

          {/* Collapse Toggle */}
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(!collapsed)}
              className="w-full justify-center"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main 
          className={cn(
            "flex-1 transition-all duration-300 relative overflow-hidden",
            collapsed ? "ml-16" : "ml-60"
          )}
        >
          <BackgroundBeams className="z-0 opacity-30" />
          <div className="relative z-10 p-4 md:p-6">
            <Routes>
              <Route index element={<AdsDashboard />} />
              <Route path="campaigns" element={<AdsCampaigns />} />
              <Route path="alerts" element={isAdmin ? <AdsAlerts /> : <ComingSoonPage title="Avisos" />} />
              <Route path="tracker" element={isAdmin ? <AdsTracker /> : <ComingSoonPage title="Tracker WhatsApp" />} />
              <Route path="settings" element={<AdsSettings />} />
            </Routes>
          </div>
        </main>
      </div>
    </>
  );
}

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Clock className="h-16 w-16 text-orange-400 mb-4" />
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground">Esta funcionalidade estará disponível em breve.</p>
      <Badge 
        variant="outline" 
        className="mt-4 text-sm px-3 py-1 bg-orange-500/10 text-orange-400 border-orange-500/30"
      >
        Em desenvolvimento
      </Badge>
    </div>
  );
}
