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
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BackgroundBeams } from "@/components/ui/background-beams";
import AdsDashboard from "./AdsDashboard";
import AdsCampaigns from "./AdsCampaigns";
import AdsAlerts from "./AdsAlerts";
import AdsTracker from "./AdsTracker";
import AdsSettings from "./AdsSettings";

interface SidebarItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const sidebarItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/ads" },
  { icon: Megaphone, label: "Campanhas", path: "/ads/campaigns" },
  { icon: Bell, label: "Avisos", path: "/ads/alerts" },
  { icon: MessageSquare, label: "Tracker WhatsApp", path: "/ads/tracker" },
  { icon: Settings, label: "Configurações", path: "/ads/settings" },
];

export default function AdsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleModeChange = (mode: AppMode) => {
    if (mode !== "ads") {
      navigate("/");
    }
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
              
              return (
                <motion.button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <AnimatePresence mode="wait">
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="text-sm font-medium whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
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
              <Route path="alerts" element={<AdsAlerts />} />
              <Route path="tracker" element={<AdsTracker />} />
              <Route path="settings" element={<AdsSettings />} />
            </Routes>
          </div>
        </main>
      </div>
    </>
  );
}
