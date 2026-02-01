import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SystemsSidebar } from "@/components/layout/SystemsSidebar";
import { Feed } from "@/components/feed/Feed";
import { PopularSystemsMarquee } from "@/components/feed/PopularSystemsMarquee";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import Marketplace from "./Marketplace";

export type AppMode = "sistemas" | "marketplace" | "ads";

const HomePage = () => {
  const navigate = useNavigate();
  const { isImpersonating } = useImpersonation();
  const [refreshFeed, setRefreshFeed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem("homeMode");
    if (saved === "marketplace") return "marketplace";
    if (saved === "ads") return "ads";
    return "sistemas";
  });

  useEffect(() => {
    localStorage.setItem("homeMode", mode);
  }, [mode]);

  useEffect(() => {
    if (mode === "ads") {
      navigate("/ads");
    }
  }, [mode, navigate]);

  if (mode === "marketplace") {
    return <Marketplace onModeChange={setMode} currentMode={mode} />;
  }

  const spacerHeight = isImpersonating ? "h-24" : "h-14";

  return (
    <div className="min-h-screen bg-background">
      <Header mode={mode} onModeChange={setMode} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={spacerHeight} />
      
      <SystemsSidebar 
        isOpen={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
      />
      
      {/* Main Content Area */}
      <main className={`${sidebarOpen ? 'lg:ml-64' : ''} transition-all duration-200`}>
        {/* Popular Systems Marquee - Full width */}
        <PopularSystemsMarquee />
        
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Feed Header */}
          <div className="mb-8">
            <h1 className="text-xl font-semibold text-foreground">Feed da Comunidade</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compartilhe suas experiências e interaja com outros membros
            </p>
          </div>

          {/* Feed */}
          <Feed key={refreshFeed} />
        </div>
      </main>
    </div>
  );
};

export default HomePage;