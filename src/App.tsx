import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MemberRoute } from "@/components/MemberRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { AdminNotifications } from "@/components/AdminNotifications";
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
import TagWhats from "./pages/TagWhats";
import ExtensaoAdsWhatsApp from "./pages/ExtensaoAdsWhatsApp";
import VideoDownloader from "./pages/VideoDownloader";
import SMSBot from "./pages/SMSBot";
import SMMPanel from "./pages/SMMPanel";
import MaturadorDashboard from "./pages/MaturadorDashboard";
import MaturadorConfig from "./pages/MaturadorConfig";
import MaturadorInstances from "./pages/MaturadorInstances";
import MaturadorConversations from "./pages/MaturadorConversations";
import AdminPanelNew from "./pages/AdminPanelNew";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <AnnouncementPopup />
          <AdminNotifications />
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
            <Route path="/tag-whats" element={<MemberRoute featureName="Tag Whats"><TagWhats /></MemberRoute>} />
            <Route path="/extensao-ads" element={<ProtectedRoute><ExtensaoAdsWhatsApp /></ProtectedRoute>} />
            <Route path="/video-downloader" element={<ProtectedRoute><VideoDownloader /></ProtectedRoute>} />
            <Route path="/maturador" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorDashboard /></MemberRoute>} />
            <Route path="/maturador/config" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorConfig /></MemberRoute>} />
            <Route path="/maturador/instances" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorInstances /></MemberRoute>} />
            <Route path="/maturador/conversations" element={<MemberRoute featureName="Maturador de WhatsApp"><MaturadorConversations /></MemberRoute>} />
            
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

export default App;
