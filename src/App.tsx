import { useRef, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import FacebookOAuthHandler from "@/components/ads/FacebookOAuthHandler";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MemberRoute } from "@/components/MemberRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";

import Toaster, { ToasterRef } from "@/components/ui/toast";
import { setGlobalToasterRef } from "@/hooks/useSplashedToast";
import Home from "./pages/Home";
import Index from "./pages/Index";
import ProductMetrics from "./pages/ProductMetrics";
import ProductAnalysis from "./pages/ProductAnalysis";
import NumberOrganizer from "./pages/NumberOrganizer";
import TrackOfertas from "./pages/TrackOfertas";
import WhatsAppFunnelCreator from "./pages/WhatsAppFunnelCreator";
import CreativeGenerator from "./pages/CreativeGenerator";
import VideoVariationGenerator from "./pages/VideoVariationGenerator";
import AudioGenerator from "./pages/AudioGenerator";
import AudioTranscriber from "./pages/AudioTranscriber";
import CreativeAnalyzer from "./pages/CreativeAnalyzer";
import ZapSpy from "./pages/ZapSpy";
import TagWhatsSelect from "./pages/TagWhatsSelect";
import TagWhatsLocal from "./pages/TagWhatsLocal";
import TagWhatsCloud from "./pages/TagWhatsCloud";
import TagWhatsAddNumber from "./pages/TagWhatsAddNumber";
import ExtensaoAdsWhatsApp from "./pages/ExtensaoAdsWhatsApp";
import VideoDownloader from "./pages/VideoDownloader";
import SMSBot from "./pages/SMSBot";
import SMMPanel from "./pages/SMMPanel";
import MaturadorDashboard from "./pages/MaturadorDashboard";
import MaturadorInstances from "./pages/MaturadorInstances";
import MaturadorConversations from "./pages/MaturadorConversations";
import MaturadorChat from "./pages/MaturadorChat";
import MaturadorVerifiedContacts from "./pages/MaturadorVerifiedContacts";
import SaveWhatsApp from "./pages/SaveWhatsApp";
import AdminPanelNew from "./pages/AdminPanelNew";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import InboxPage from "./pages/InboxPage";
import FlowListPage from "./pages/FlowListPage";
import FlowEditorPage from "./pages/FlowEditorPage";
import InboxDashboard from "./pages/InboxDashboard";
import MessageBlaster from "./pages/MessageBlaster";
import SiteCloner from "./pages/SiteCloner";
import AdsLayout from "./pages/ads/AdsLayout";

const queryClient = new QueryClient();

const App = () => {
  const toasterRef = useRef<ToasterRef>(null);

  useEffect(() => {
    if (toasterRef.current) {
      setGlobalToasterRef(toasterRef.current);
    }
    return () => {
      setGlobalToasterRef(null);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster ref={toasterRef} defaultPosition="bottom-right" />
        <HashRouter>
          <AuthProvider>
            <FacebookOAuthHandler />
            <AnnouncementPopup />
            
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              
              {/* FREE SYSTEMS - Available to all users */}
              <Route path="/metricas" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/organizador-numeros" element={<ProtectedRoute><NumberOrganizer /></ProtectedRoute>} />
              <Route path="/track-ofertas" element={<ProtectedRoute><TrackOfertas /></ProtectedRoute>} />
              <Route path="/zap-spy" element={<ProtectedRoute><ZapSpy /></ProtectedRoute>} />
              <Route path="/sms-bot" element={<ProtectedRoute><SMSBot /></ProtectedRoute>} />
              <Route path="/smm-panel" element={<ProtectedRoute><SMMPanel /></ProtectedRoute>} />
              <Route path="/produto/:productId" element={<ProtectedRoute><ProductMetrics /></ProtectedRoute>} />
              <Route path="/produto/:productId/analise" element={<ProtectedRoute><ProductAnalysis /></ProtectedRoute>} />
              
              {/* MEMBER-ONLY SYSTEMS - Requires full membership */}
              <Route path="/criador-funil" element={<MemberRoute featureName="Criador de Funil"><WhatsAppFunnelCreator /></MemberRoute>} />
              <Route path="/gerador-criativos" element={<MemberRoute featureName="Gerador de Criativos em Imagem"><CreativeGenerator /></MemberRoute>} />
              <Route path="/gerador-variacoes-video" element={<MemberRoute featureName="Gerador de Criativos em Vídeo"><VideoVariationGenerator /></MemberRoute>} />
              <Route path="/gerador-audio" element={<MemberRoute featureName="Gerador de Áudio"><AudioGenerator /></MemberRoute>} />
              <Route path="/transcricao-audio" element={<MemberRoute featureName="Transcrição de Áudio"><AudioTranscriber /></MemberRoute>} />
              <Route path="/analisador-criativos" element={<MemberRoute featureName="Analisador de Criativos"><CreativeAnalyzer /></MemberRoute>} />
              <Route path="/tag-whats" element={<MemberRoute featureName="Tag Whats"><TagWhatsSelect /></MemberRoute>} />
              <Route path="/tag-whats/local" element={<MemberRoute featureName="Tag Whats"><TagWhatsLocal /></MemberRoute>} />
              <Route path="/tag-whats/cloud" element={<MemberRoute featureName="Tag Whats"><TagWhatsCloud /></MemberRoute>} />
              <Route path="/tag-whats/cloud/add-number" element={<MemberRoute featureName="Tag Whats"><TagWhatsAddNumber /></MemberRoute>} />
              <Route path="/extensao-ads" element={<ProtectedRoute><ExtensaoAdsWhatsApp /></ProtectedRoute>} />
              <Route path="/video-downloader" element={<ProtectedRoute><VideoDownloader /></ProtectedRoute>} />
              <Route path="/maturador" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorDashboard /></MemberRoute>} />
              <Route path="/maturador/instances" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorInstances /></MemberRoute>} />
              <Route path="/maturador/conversations" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorConversations /></MemberRoute>} />
              <Route path="/maturador/chat" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorChat /></MemberRoute>} />
              <Route path="/maturador/verified-contacts" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorVerifiedContacts /></MemberRoute>} />
              <Route path="/save-whatsapp" element={<ProtectedRoute><SaveWhatsApp /></ProtectedRoute>} />
              <Route path="/inbox" element={<MemberRoute featureName="Automati-Zap"><InboxDashboard /></MemberRoute>} />
              <Route path="/inbox/chat" element={<MemberRoute featureName="Automati-Zap"><InboxPage /></MemberRoute>} />
              <Route path="/inbox/flows" element={<MemberRoute featureName="Automati-Zap"><FlowListPage /></MemberRoute>} />
              <Route path="/inbox/flows/:id" element={<MemberRoute featureName="Automati-Zap"><FlowEditorPage /></MemberRoute>} />
              <Route path="/disparador" element={<MemberRoute featureName="DisparaZap"><MessageBlaster /></MemberRoute>} />
              <Route path="/disparazap/fluxos" element={<MemberRoute featureName="DisparaZap"><FlowListPage /></MemberRoute>} />
              <Route path="/disparazap/fluxos/novo" element={<MemberRoute featureName="DisparaZap"><FlowEditorPage /></MemberRoute>} />
              <Route path="/disparazap/fluxos/:id" element={<MemberRoute featureName="DisparaZap"><FlowEditorPage /></MemberRoute>} />
              <Route path="/clonador" element={<MemberRoute featureName="Clonador de Entregável"><SiteCloner /></MemberRoute>} />
              
              {/* ADS MODULE */}
              <Route path="/ads/*" element={<MemberRoute featureName="ADS X1"><AdsLayout /></MemberRoute>} />
              
              {/* ADMIN ROUTES */}
              <Route path="/admin-panel" element={<AdminRoute><AdminPanelNew /></AdminRoute>} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
