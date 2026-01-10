import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SystemsSidebar } from "@/components/layout/SystemsSidebar";
import { Feed } from "@/components/feed/Feed";
import { CreatePostCard } from "@/components/feed/CreatePostCard";
import { RestrictedFeatureModal } from "@/components/RestrictedFeatureModal";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useAuth } from "@/contexts/AuthContext";
import Marketplace from "./Marketplace";
import { cn } from "@/lib/utils";

export type AppMode = "sistemas" | "marketplace" | "ads";

const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string>("");
  const [refreshFeed, setRefreshFeed] = useState(0);

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

  const handlePostCreated = () => {
    setRefreshFeed(prev => prev + 1);
  };

  if (mode === "marketplace") {
    return <Marketplace onModeChange={setMode} currentMode={mode} />;
  }

  return (
    <>
      <Header mode={mode} onModeChange={setMode} />
      <div className="h-14 md:h-16" />
      
      <SystemsSidebar onRestrictedClick={handleRestrictedClick} />
      
      {/* Main Content Area */}
      <div className="lg:ml-64 min-h-screen bg-background">
        <div className="container mx-auto max-w-2xl px-4 py-6">
          {/* Feed Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Feed da Comunidade</h1>
            <p className="text-muted-foreground text-sm">
              Compartilhe suas experiências e interaja com outros membros
            </p>
          </div>

          {/* Create Post - Only for full members */}
          {!accessLoading && isFullMember && (
            <div className="mb-6">
              <CreatePostCard onPostCreated={handlePostCreated} />
            </div>
          )}

          {/* Feed */}
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
