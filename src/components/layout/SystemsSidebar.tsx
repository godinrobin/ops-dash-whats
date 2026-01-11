"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  BarChart3, 
  Phone, 
  Target, 
  Search, 
  Puzzle, 
  Key,
  MessageSquare,
  Image,
  Video,
  Mic,
  FileText,
  Microscope,
  Bot,
  Flame,
  Save,
  Send,
  Edit,
  Tag,
  Music,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Home,
  Lock,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import tiktokLogo from "@/assets/tiktok-logo.png";
import automatizapIcon from "@/assets/automatizap-icon.png";
import disparazapIcon from "@/assets/disparazap-icon.png";

interface SystemItem {
  id: string;
  path: string;
  title: string;
  icon: React.ReactNode;
  restricted: boolean;
  comingSoon?: boolean;
}

interface SystemGroup {
  id: string;
  title: string;
  systems: SystemItem[];
}

const systemGroups: SystemGroup[] = [
  {
    id: "organizacao",
    title: "Organização",
    systems: [
      { id: "metricas", path: "/metricas", title: "Métricas", icon: <BarChart3 className="w-4 h-4" />, restricted: false },
      { id: "organizador", path: "/organizador-numeros", title: "Organizador de Números", icon: <Phone className="w-4 h-4" />, restricted: false },
    ]
  },
  {
    id: "mineracao",
    title: "Mineração",
    systems: [
      { id: "track-ofertas", path: "/track-ofertas", title: "Track Ofertas", icon: <Target className="w-4 h-4" />, restricted: false },
      { id: "zap-spy", path: "/zap-spy", title: "Zap Spy", icon: <Search className="w-4 h-4" />, restricted: false },
      { id: "extensao-ads", path: "/extensao-ads", title: "Extensão Ads", icon: <Puzzle className="w-4 h-4" />, restricted: false },
      { id: "gerador-palavras", path: "/gerador-palavras-chaves", title: "Gerador de Palavras Chaves", icon: <Key className="w-4 h-4" />, restricted: false },
    ]
  },
  {
    id: "criacao",
    title: "Criação de Oferta",
    systems: [
      { id: "funil", path: "/criador-funil", title: "Funil", icon: <MessageSquare className="w-4 h-4" />, restricted: true },
      { id: "criativos-imagem", path: "/gerador-criativos", title: "Criativos Imagem", icon: <Image className="w-4 h-4" />, restricted: true },
      { id: "criativos-video", path: "/gerador-variacoes-video", title: "Criativos Vídeo", icon: <Video className="w-4 h-4" />, restricted: true },
      { id: "audio", path: "/gerador-audio", title: "Áudio", icon: <Mic className="w-4 h-4" />, restricted: true },
      { id: "transcricao", path: "/transcricao-audio", title: "Transcrição", icon: <FileText className="w-4 h-4" />, restricted: true },
      { id: "analisador", path: "/analisador-criativos", title: "Analisador", icon: <Microscope className="w-4 h-4" />, restricted: true },
    ]
  },
  {
    id: "ferramentas-x1",
    title: "Ferramentas X1",
    systems: [
      { id: "automatizap", path: "/inbox", title: "Automati-Zap", icon: <img src={automatizapIcon} alt="Automati-Zap" className="w-4 h-4 object-contain" />, restricted: true },
      { id: "maturador", path: "/maturador", title: "Maturador", icon: <Flame className="w-4 h-4" />, restricted: true },
      { id: "save-whats", path: "/save-whatsapp", title: "Save Whats", icon: <Save className="w-4 h-4" />, restricted: false },
      { id: "disparazap", path: "/disparador", title: "Disparazap", icon: <img src={disparazapIcon} alt="Disparazap" className="w-4 h-4 object-contain" />, restricted: true, comingSoon: true },
      { id: "edicao-whats", path: "/whatsapp-editor", title: "Edição Whats", icon: <Edit className="w-4 h-4" />, restricted: true },
      { id: "tag-whats", path: "/tag-whats", title: "Tag Whats", icon: <Tag className="w-4 h-4" />, restricted: true },
    ]
  },
  {
    id: "extras",
    title: "Extras",
    systems: [
      { id: "tiktok", path: "/video-downloader", title: "Tiktok", icon: <img src={tiktokLogo} alt="TikTok" className="w-4 h-4 object-contain" />, restricted: false },
      { id: "zap-converter", path: "/zap-converter", title: "Zap Converter", icon: <RefreshCw className="w-4 h-4" />, restricted: false },
    ]
  },
];

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection = ({ title, children, defaultOpen = true }: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {title}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SystemsSidebarProps {
  onRestrictedClick?: (featureName: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

export const SystemsSidebar = ({ onRestrictedClick, isOpen = false, onToggle }: SystemsSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const { isAdmin } = useAdminStatus();

  const handleSystemClick = (system: SystemItem) => {
    if (system.comingSoon && !isAdmin) {
      return;
    }
    
    if (system.restricted && !isFullMember && !isAdmin) {
      onRestrictedClick?.(system.title);
      return;
    }
    
    navigate(system.path);
    onToggle?.();
  };

  const isActiveSystem = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  const renderSystemButton = (system: SystemItem) => {
    const isLocked = !accessLoading && !isFullMember && system.restricted && !isAdmin;
    const isComingSoon = system.comingSoon && !isAdmin;
    const isActive = isActiveSystem(system.path);

    return (
      <button
        key={system.id}
        onClick={() => handleSystemClick(system)}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-lg transition-all duration-200",
          isActive 
            ? "bg-accent/20 text-accent border-l-2 border-accent" 
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
          isComingSoon && "opacity-50 cursor-not-allowed",
          isLocked && "opacity-70"
        )}
        disabled={isComingSoon}
      >
        <span className="flex-shrink-0">{system.icon}</span>
        <span className="flex-1 text-left truncate">{system.title}</span>
        {isLocked && !isComingSoon && <Lock className="w-3 h-3 text-accent" />}
        {isComingSoon && (
          <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded-full font-medium">
            em breve
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Home button */}
      <div className="p-3 border-b border-border/50">
        <button
          onClick={() => { navigate("/"); onToggle?.(); }}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-lg transition-all duration-200",
            location.pathname === "/" 
              ? "bg-accent/20 text-accent" 
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          <Home className="w-4 h-4" />
          <span className="font-medium">Feed</span>
        </button>
      </div>

      {/* Systems */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {systemGroups.map((group) => (
          <CollapsibleSection key={group.id} title={group.title}>
            <div className="space-y-1 pl-1">
              {group.systems.map(renderSystemButton)}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onToggle?.()}
              className="lg:hidden fixed inset-0 bg-black/50 z-40"
            />
            
            {/* Mobile Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-14 bottom-0 w-72 bg-background border-r border-border z-50"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-col w-64 bg-background/95 backdrop-blur-sm border-r border-border/50 fixed left-0 top-14 bottom-0 z-40">
        {sidebarContent}
      </div>
    </>
  );
};

export default SystemsSidebar;
