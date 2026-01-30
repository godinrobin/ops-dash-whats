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
  Send,
  Star
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

// Popular/most used systems - shown at the top of sidebar
const popularSystems: (SystemItem & { tag?: string })[] = [
  { id: "automatizap", path: "/inbox", title: "Automati-Zap", icon: <Zap className="w-4 h-4" />, restricted: true, tag: "Bot" },
  { id: "maturador", path: "/maturador", title: "Maturador", icon: <Flame className="w-4 h-4" />, restricted: true },
  { id: "audio", path: "/gerador-audio", title: "Gerador de Áudios", icon: <Mic className="w-4 h-4" />, restricted: true },
];

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
          <span className="text-[9px] px-1.5 py-0.5 bg-accent/20 text-accent rounded font-medium">
            breve
          </span>
        )}
      </button>
    );
  };

  const renderPopularSystemButton = (system: (typeof popularSystems)[0]) => {
    const isLocked = !accessLoading && !isFullMember && system.restricted && !isAdmin;
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
          isLocked && "opacity-60"
        )}
      >
        <span className={cn(
          "flex-shrink-0 transition-colors",
          isActive ? "text-accent" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {system.icon}
        </span>
        <span className="flex-1 min-w-0 text-left truncate">{system.title}</span>
        {system.tag && (
          <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-semibold uppercase">
            {system.tag}
          </span>
        )}
        {isLocked && !system.tag && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
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
        {/* Popular Systems Section */}
        <div className="bg-accent/10 rounded-lg mx-1 mb-2">
          <CollapsibleSection title="Sistemas Mais Usados">
            <div className="space-y-0.5 pl-2">
              {popularSystems.map(renderPopularSystemButton)}
            </div>
          </CollapsibleSection>
        </div>
        
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
          <a
            href="https://wa.me/5531985130889?text=Ol%C3%A1%2C%20preciso%20de%20suporte."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="WhatsApp"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
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
                {/* Popular Systems Section - Desktop */}
                <div className="bg-accent/10 rounded-lg mx-1 mb-2">
                  <CollapsibleSection title="Sistemas Mais Usados">
                    <div className="space-y-0.5 pl-2">
                      {popularSystems.map(renderPopularSystemButton)}
                    </div>
                  </CollapsibleSection>
                </div>
                
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
                  <a
                    href="https://wa.me/5531985130889?text=Ol%C3%A1%2C%20preciso%20de%20suporte."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="WhatsApp"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
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