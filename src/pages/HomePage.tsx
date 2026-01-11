import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SystemsSidebar } from "@/components/layout/SystemsSidebar";
import { Feed } from "@/components/feed/Feed";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import Marketplace from "./Marketplace";

export type AppMode = "sistemas" | "marketplace" | "ads";

const HomePage = () => {
  const navigate = useNavigate();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");
  const [refreshFeed, setRefreshFeed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const handleRestrictedClick = (featureName: string) => {
    setSelectedFeatureName(featureName);
    setRestrictedModalOpen(true);
  };

  if (mode === "marketplace") {
    return <Marketplace onModeChange={setMode} currentMode={mode} />;
  }

  return (
    <>
      <Header mode={mode} onModeChange={setMode} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className="h-14 md:h-16" />
      
      <SystemsSidebar onRestrictedClick={handleRestrictedClick} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      {/* Main Content Area */}
      <div className={`${sidebarOpen ? 'lg:ml-64' : ''} min-h-screen bg-background transition-all duration-300`}>
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {/* Feed Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Feed da Comunidade</h1>
            <p className="text-muted-foreground text-sm">
              Compartilhe suas experiências e interaja com outros membros
            </p>
          </div>

          {/* Feed (includes CreatePostCard, pending posts for admin, and approved posts) */}
          <Feed key={refreshFeed} />
        </div>
      </div>

      <RestrictedFeatureModal
        open={restrictedModalOpen}
        onOpenChange={setRestrictedModalOpen}
        featureName={selectedFeatureName}
      />
    </>
  );
};

export default HomePage;
