import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  PieChart,
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
  Bot,
  Flame,
  Save,
  Send,
  Pencil,
  Tag,
  Clock,
  Lock,
  Menu,
  X,
} from "lucide-react";
import tiktokLogo from "@/assets/tiktok-logo.png";
import automatizapIcon from "@/assets/automatizap-icon.png";
import disparazapIcon from "@/assets/disparazap-icon.png";

interface SidebarItem {
  path: string;
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  restricted?: boolean;
  comingSoon?: boolean;
}

interface SidebarGroup {
  title: string;
  items: SidebarItem[];
  defaultOpen?: boolean;
}

const sidebarGroups: SidebarGroup[] = [
  {
    title: "Organização",
    defaultOpen: true,
    items: [
      { path: "/metricas", icon: <PieChart className="w-4 h-4" />, label: "Métricas", restricted: false },
      { path: "/organizador-numeros", icon: <Smartphone className="w-4 h-4" />, label: "Organizador de Números", shortLabel: "Organizador", restricted: false },
    ],
  },
  {
    title: "Mineração",
    defaultOpen: true,
    items: [
      { path: "/track-ofertas", icon: <Target className="w-4 h-4" />, label: "Track Ofertas", restricted: false },
      { path: "/zap-spy", icon: <Search className="w-4 h-4" />, label: "Zap Spy", restricted: false },
      { path: "/extensao-ads", icon: <Puzzle className="w-4 h-4" />, label: "Extensão Ads", restricted: false },
      { path: "/gerador-palavras-chave", icon: <Key className="w-4 h-4" />, label: "Gerador de Palavras Chaves", shortLabel: "Palavras Chaves", restricted: true },
    ],
  },
  {
    title: "Criação de Oferta",
    defaultOpen: true,
    items: [
      { path: "/criador-funil", icon: <MessageSquare className="w-4 h-4" />, label: "Funil", restricted: true },
      { path: "/gerador-criativos", icon: <Image className="w-4 h-4" />, label: "Criativos Imagem", restricted: true },
      { path: "/gerador-variacoes-video", icon: <Video className="w-4 h-4" />, label: "Criativos Vídeo", restricted: true },
      { path: "/gerador-audio", icon: <Mic className="w-4 h-4" />, label: "Áudio", restricted: true },
      { path: "/transcricao-audio", icon: <FileText className="w-4 h-4" />, label: "Transcrição", restricted: true },
      { path: "/analisador-criativos", icon: <Microscope className="w-4 h-4" />, label: "Analisador", restricted: true },
    ],
  },
  {
    title: "Ferramentas X1",
    defaultOpen: true,
    items: [
      { 
        path: "/inbox", 
        icon: <img src={automatizapIcon} className="w-4 h-4" alt="Automati-Zap" />, 
        label: "Automati-Zap", 
        restricted: true 
      },
      { path: "/maturador", icon: <Flame className="w-4 h-4" />, label: "Maturador", restricted: true },
      { path: "/save-whatsapp", icon: <Save className="w-4 h-4" />, label: "Save Whats", restricted: false },
      { 
        path: "/disparador", 
        icon: <img src={disparazapIcon} className="w-4 h-4" alt="DisparaZap" />, 
        label: "Disparazap", 
        restricted: true, 
        comingSoon: true 
      },
      { path: "/whatsapp-editor", icon: <Pencil className="w-4 h-4" />, label: "Edição Whats", restricted: true },
      { path: "/tag-whats", icon: <Tag className="w-4 h-4" />, label: "Tag Whats", restricted: true },
    ],
  },
  {
    title: "Extras",
    defaultOpen: true,
    items: [
      { 
        path: "/video-downloader", 
        icon: <img src={tiktokLogo} className="w-4 h-4" alt="TikTok" />, 
        label: "Download Vídeos Tiktok", 
        restricted: false 
      },
      { path: "/zap-converter", icon: <LayoutGrid className="w-4 h-4" />, label: "Zap Converter", restricted: false },
    ],
  },
];

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection = ({ title, children, defaultOpen = false }: CollapsibleSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{title}</span>
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

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRestrictedModal: (featureName: string) => void;
}

export const AppSidebar = ({ isOpen, onClose, onOpenRestrictedModal }: AppSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isFullMember, loading: accessLoading } = useAccessLevel();
  const { isAdmin } = useAdminStatus();
  const { user } = useAuth();

  const handleItemClick = (item: SidebarItem) => {
    // Coming soon - only admins can bypass
    if (item.comingSoon && !isAdmin) {
      return;
    }

    // Check access
    if (!isFullMember && item.restricted && !isAdmin) {
      onOpenRestrictedModal(item.label);
      return;
    }

    navigate(item.path);
    onClose();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">Sistemas</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2">
        {sidebarGroups.map((group) => (
          <CollapsibleSection key={group.title} title={group.title} defaultOpen={group.defaultOpen}>
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                const isLocked = !accessLoading && isFullMember === false && item.restricted && !isAdmin;
                const showComingSoon = item.comingSoon && !isAdmin;

                return (
                  <button
                    key={item.path}
                    onClick={() => handleItemClick(item)}
                    disabled={showComingSoon}
                    className={cn(
                      "flex items-start gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all",
                      isActive
                        ? "bg-accent/20 text-accent font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                      showComingSoon && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                    <span className="flex-1 min-w-0 whitespace-normal break-words leading-snug">{item.shortLabel || item.label}</span>
                    
                    {showComingSoon && (
                      <Clock className="w-3 h-3 ml-auto text-yellow-500 flex-shrink-0 mt-1" />
                    )}
                    {isLocked && !showComingSoon && (
                      <Lock className="w-3 h-3 ml-auto text-accent flex-shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-background border-r border-border z-50 lg:hidden"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-r border-border bg-background/95">
        {sidebarContent}
      </aside>
    </>
  );
};
