"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  BarChart3, 
  Phone, 
  Smartphone,
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
  Flame,
  Save,
  Edit,
  Tag,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Home,
  Lock,
  Zap,
  Send
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import tiktokLogo from "@/assets/tiktok-logo.png";

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
      { id: "funil", path: "/criador-funil", title: "Gerador de Funil de X1", icon: <MessageSquare className="w-4 h-4" />, restricted: true },
      { id: "criativos-imagem", path: "/gerador-criativos", title: "Gerador de Criativos em Imagem", icon: <Image className="w-4 h-4" />, restricted: true },
      { id: "criativos-video", path: "/gerador-variacoes-video", title: "Gerador de Múltiplos Criativos em Vídeo", icon: <Video className="w-4 h-4" />, restricted: true },
      { id: "entregavel-site", path: "/criador-entregavel", title: "Criador de Entregável em Site", icon: <Smartphone className="w-4 h-4" />, restricted: true },
      { id: "audio", path: "/gerador-audio", title: "Gerador de Áudio", icon: <Mic className="w-4 h-4" />, restricted: true },
      { id: "transcricao", path: "/transcricao-audio", title: "Transcrição", icon: <FileText className="w-4 h-4" />, restricted: true },
      { id: "analisador", path: "/analisador-criativos", title: "Analisador de Criativos", icon: <Microscope className="w-4 h-4" />, restricted: true },
    ]
  },
  {
    id: "ferramentas-x1",
    title: "Ferramentas X1",
    systems: [
      { id: "automatizap", path: "/inbox", title: "Automati-Zap", icon: <Zap className="w-4 h-4" />, restricted: true },
      { id: "maturador", path: "/maturador", title: "Maturador", icon: <Flame className="w-4 h-4" />, restricted: true },
      { id: "save-whats", path: "/save-whatsapp", title: "Save Whats", icon: <Save className="w-4 h-4" />, restricted: false },
      { id: "disparazap", path: "/disparador", title: "Disparazap", icon: <Send className="w-4 h-4" />, restricted: true, comingSoon: true },
      { id: "edicao-whats", path: "/whatsapp-editor", title: "Edição Whats", icon: <Edit className="w-4 h-4" />, restricted: true },
      { id: "tag-whats", path: "/tag-whats", title: "Tag Whats", icon: <Tag className="w-4 h-4" />, restricted: true },
    ]
  },
  {
    id: "extras",
    title: "Extras",
    systems: [
      { id: "tiktok", path: "/video-downloader", title: "Download Vídeos Tiktok", icon: <img src={tiktokLogo} alt="TikTok" className="w-4 h-4 object-contain" />, restricted: false },
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
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent hover:text-accent/80 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
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
          "group flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors",
          isActive 
            ? "bg-accent/10 text-accent" 
            : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          isComingSoon && "opacity-40 cursor-not-allowed",
          isLocked && "opacity-60"
        )}
        disabled={isComingSoon}
      >
        <span className={cn(
          "flex-shrink-0 transition-colors",
          isActive ? "text-accent" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {system.icon}
        </span>
        <span className="flex-1 min-w-0 text-left truncate">{system.title}</span>
        {isLocked && !isComingSoon && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
        {isComingSoon && (
          <span className="text-[9px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-medium">
            breve
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo/Brand area */}
      <div className="p-4 border-b border-border">
        <button
          onClick={() => { navigate("/"); onToggle?.(); }}
          className="flex items-center gap-2 group"
        >
          <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <span className="text-accent-foreground font-bold text-sm">Z</span>
          </div>
          <span className="font-semibold text-accent group-hover:text-accent/80 transition-colors">Zapdata</span>
        </button>
      </div>

      {/* Navigation Header */}
      <div className="px-4 py-3">
        <button
          onClick={() => { navigate("/"); onToggle?.(); }}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors",
            location.pathname === "/" 
              ? "bg-accent/10 text-accent" 
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          <Home className="w-4 h-4" />
          <span className="font-medium">Feed</span>
        </button>
      </div>

      {/* Systems Navigation */}
      <div className="flex-1 overflow-y-auto scrollbar-sidebar px-2 pb-4">
        {systemGroups.map((group) => (
          <CollapsibleSection key={group.id} title={group.title}>
            <div className="space-y-0.5 pl-2">
              {group.systems.map(renderSystemButton)}
            </div>
          </CollapsibleSection>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-center gap-3">
          <a
            href="https://www.youtube.com/@joaolucassps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="YouTube"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </a>
          <a
            href="https://instagram.com/joaolucassps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Instagram"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
          </a>
        </div>
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
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            
            {/* Mobile Drawer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border z-50"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="hidden lg:flex flex-col w-64 bg-card border-r border-border fixed left-0 top-14 bottom-0 z-40"
          >
            {/* Skip logo on desktop since header has it */}
            <div className="flex flex-col h-full">
              {/* Navigation Header */}
              <div className="px-3 py-3">
                <button
                  onClick={() => { navigate("/"); onToggle?.(); }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md transition-colors",
                    location.pathname === "/" 
                      ? "bg-accent/10 text-accent" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Home className="w-4 h-4" />
                  <span className="font-medium">Feed</span>
                </button>
              </div>

              {/* Systems Navigation */}
              <div className="flex-1 overflow-y-auto scrollbar-sidebar px-2 pb-4">
                {systemGroups.map((group) => (
                  <CollapsibleSection key={group.id} title={group.title}>
                    <div className="space-y-0.5 pl-2">
                      {group.systems.map(renderSystemButton)}
                    </div>
                  </CollapsibleSection>
                ))}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-border">
                <div className="flex items-center justify-center gap-3">
                  <a
                    href="https://www.youtube.com/@joaolucassps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="YouTube"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </a>
                  <a
                    href="https://instagram.com/joaolucassps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Instagram"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SystemsSidebar;