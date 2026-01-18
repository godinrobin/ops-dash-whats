import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Bell, Megaphone, ChevronLeft, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { PushNotificationsSettings } from "@/components/settings/PushNotificationsSettings";
import { PixelSettings } from "@/components/settings/PixelSettings";

type SettingsSection = "notifications" | "pixel";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>("notifications");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  const menuItems = [
    {
      id: "notifications" as const,
      label: "Notificações Push",
      icon: Bell,
      description: "Configure alertas e dispositivos"
    },
    {
      id: "pixel" as const,
      label: "Pixel do Facebook",
      icon: Megaphone,
      description: "Gerencie seus pixels e tokens"
    }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "notifications":
        return <PushNotificationsSettings />;
      case "pixel":
        return <PixelSettings />;
      default:
        return <PushNotificationsSettings />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-b border-border z-50">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-accent" />
              <h1 className="text-lg font-semibold">Configurações</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="pt-16 flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:flex w-64 min-h-[calc(100vh-4rem)] border-r border-border flex-col bg-card/50">
          <ScrollArea className="flex-1 p-4">
            <nav className="space-y-2">
              {menuItems.map((item) => (
                <motion.button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                    activeSection === item.id
                      ? "bg-accent/10 border border-accent/50 text-accent"
                      : "hover:bg-secondary/50 border border-transparent"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 mt-0.5",
                    activeSection === item.id ? "text-accent" : "text-muted-foreground"
                  )} />
                  <div>
                    <span className="font-medium text-sm">{item.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </motion.button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Mobile Menu */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40">
          <div className="flex">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 p-3 transition-colors",
                  activeSection === item.id
                    ? "text-accent bg-accent/10"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
