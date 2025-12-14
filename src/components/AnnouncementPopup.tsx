import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, ExternalLink } from "lucide-react";

interface Announcement {
  id: string;
  title: string | null;
  content: string;
  image_url: string | null;
  redirect_type: 'none' | 'custom_link' | 'system';
  redirect_url: string | null;
  redirect_system: string | null;
  redirect_button_text: string | null;
  scheduled_at: string | null;
}

// Mapeamento dos sistemas disponíveis
const SYSTEMS = [
  { id: "metricas", name: "Sistema de Métricas", emoji: "📊", route: "/metricas" },
  { id: "organizador-numeros", name: "Organizador de Números", emoji: "📱", route: "/organizador-numeros" },
  { id: "track-ofertas", name: "Track Ofertas", emoji: "🎯", route: "/track-ofertas" },
  { id: "criador-funil", name: "Criador de Funil", emoji: "💬", route: "/criador-funil" },
  { id: "gerador-criativos-imagem", name: "Gerador de Criativos em Imagem", emoji: "🖼️", route: "/gerador-criativos" },
  { id: "gerador-criativos-video", name: "Gerador de Criativos em Vídeo", emoji: "🎬", route: "/gerador-variacoes-video" },
  { id: "gerador-audio", name: "Gerador de Áudio", emoji: "🎙️", route: "/gerador-audio" },
  { id: "transcricao-audio", name: "Transcrição de Áudio", emoji: "📝", route: "/transcricao-audio" },
  { id: "zap-spy", name: "Zap Spy", emoji: "🔍", route: "/zap-spy" },
  { id: "tag-whats", name: "Tag Whats", emoji: "📲", route: "/tag-whats" },
  { id: "painel-marketing", name: "Painel Marketing", emoji: "📈", route: "/smm-panel" },
  { id: "numeros-virtuais", name: "Números Virtuais", emoji: "📞", route: "/sms-bot" },
];

export const AnnouncementPopup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (user) {
      checkForUnseenAnnouncements();
    }
  }, [user]);

  const checkForUnseenAnnouncements = async () => {
    try {
      // Buscar avisos ativos que o usuário ainda não viu
      const { data: announcements, error: announcementsError } = await supabase
        .from("admin_announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (announcementsError) throw announcementsError;

      if (!announcements || announcements.length === 0) return;

      // Buscar visualizações do usuário
      const { data: views, error: viewsError } = await supabase
        .from("user_announcement_views")
        .select("announcement_id")
        .eq("user_id", user?.id);

      if (viewsError) throw viewsError;

      const viewedIds = new Set(views?.map(v => v.announcement_id) || []);

      // Encontrar o primeiro aviso não visto que não está agendado para o futuro
      const now = new Date();
      const unseenAnnouncement = announcements.find(a => {
        if (viewedIds.has(a.id)) return false;
        // Se tem scheduled_at e ainda não chegou a hora, não mostrar
        if (a.scheduled_at && new Date(a.scheduled_at) > now) return false;
        return true;
      });

      if (unseenAnnouncement) {
        setAnnouncement(unseenAnnouncement as Announcement);
        setIsOpen(true);
        // Registrar visualização
        await registerView(unseenAnnouncement.id);
      }
    } catch (err) {
      console.error("Error checking announcements:", err);
    }
  };

  const registerView = async (announcementId: string) => {
    try {
      // Inserir visualização (registra usuário único)
      await supabase
        .from("user_announcement_views")
        .insert({
          user_id: user?.id,
          announcement_id: announcementId,
        });

      // Contar total de usuários únicos que viram este aviso
      const { count: viewsCount } = await supabase
        .from("user_announcement_views")
        .select("*", { count: "exact", head: true })
        .eq("announcement_id", announcementId);

      // Atualizar contador com contagem real de usuários únicos
      await supabase
        .from("admin_announcements")
        .update({ views_count: viewsCount || 0 })
        .eq("id", announcementId);
    } catch (err) {
      console.error("Error registering view:", err);
    }
  };

  const handleClick = async (type: 'redirect' | 'system', value?: string) => {
    if (!announcement) return;

    try {
      // Atualizar que houve clique para este usuário
      await supabase
        .from("user_announcement_views")
        .update({ clicked: true })
        .eq("user_id", user?.id)
        .eq("announcement_id", announcement.id);

      // Contar total de usuários únicos que clicaram
      const { count: clicksCount } = await supabase
        .from("user_announcement_views")
        .select("*", { count: "exact", head: true })
        .eq("announcement_id", announcement.id)
        .eq("clicked", true);

      // Atualizar contador com contagem real de usuários únicos que clicaram
      await supabase
        .from("admin_announcements")
        .update({ clicks_count: clicksCount || 0 })
        .eq("id", announcement.id);
    } catch (err) {
      console.error("Error registering click:", err);
    }

    // Navegar ou abrir link
    if (type === 'redirect' && announcement.redirect_url) {
      window.open(announcement.redirect_url, "_blank");
    } else if (type === 'system' && value) {
      const system = SYSTEMS.find(s => s.id === value);
      if (system) {
        navigate(system.route);
      }
    }

    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!announcement) return null;

  // Parse sistemas selecionados
  const selectedSystems = announcement.redirect_system 
    ? announcement.redirect_system.split(",").map(s => s.trim())
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg border-accent">
        <DialogHeader>
          {announcement.title && (
            <DialogTitle className="text-xl text-center">
              {announcement.title}
            </DialogTitle>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Imagem */}
          {announcement.image_url && (
            <div className="w-full rounded-lg overflow-hidden">
              <img 
                src={announcement.image_url} 
                alt="Aviso" 
                className="w-full h-auto object-contain max-h-64"
              />
            </div>
          )}

          {/* Conteúdo */}
          <p className="text-center text-muted-foreground whitespace-pre-wrap">
            {announcement.content}
          </p>

          {/* Sistemas (quando redirect_type = 'system') */}
          {announcement.redirect_type === 'system' && selectedSystems.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {selectedSystems.map(systemId => {
                const system = SYSTEMS.find(s => s.id === systemId);
                if (!system) return null;
                return (
                  <Button
                    key={systemId}
                    variant="outline"
                    className="flex flex-col items-center gap-1 h-auto py-3 px-4 border-accent hover:bg-accent/10"
                    onClick={() => handleClick('system', systemId)}
                  >
                    <span className="text-2xl">{system.emoji}</span>
                    <span className="text-xs">{system.name}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Botão de redirecionamento personalizado */}
          {announcement.redirect_type === 'custom_link' && announcement.redirect_url && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => handleClick('redirect')}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {announcement.redirect_button_text || "Acessar"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
