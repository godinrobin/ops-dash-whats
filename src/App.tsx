import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import Home from "./pages/Home";
import Index from "./pages/Index";
import ProductMetrics from "./pages/ProductMetrics";
import ProductAnalysis from "./pages/ProductAnalysis";
import NumberOrganizer from "./pages/NumberOrganizer";
import TrackOfertas from "./pages/TrackOfertas";
import WhatsAppFunnelCreator from "./pages/WhatsAppFunnelCreator";
import CreativeGenerator from "./pages/CreativeGenerator";
import AudioGenerator from "./pages/AudioGenerator";
import AudioTranscriber from "./pages/AudioTranscriber";
import ZapSpy from "./pages/ZapSpy";
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
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/metricas" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/organizador-numeros" element={<ProtectedRoute><NumberOrganizer /></ProtectedRoute>} />
            <Route path="/track-ofertas" element={<ProtectedRoute><TrackOfertas /></ProtectedRoute>} />
            <Route path="/criador-funil" element={<ProtectedRoute><WhatsAppFunnelCreator /></ProtectedRoute>} />
            <Route path="/gerador-criativos" element={<ProtectedRoute><CreativeGenerator /></ProtectedRoute>} />
            <Route path="/gerador-audio" element={<ProtectedRoute><AudioGenerator /></ProtectedRoute>} />
            <Route path="/transcricao-audio" element={<ProtectedRoute><AudioTranscriber /></ProtectedRoute>} />
            <Route path="/zap-spy" element={<ProtectedRoute><ZapSpy /></ProtectedRoute>} />
            <Route path="/produto/:productId" element={<ProtectedRoute><ProductMetrics /></ProtectedRoute>} />
            <Route path="/produto/:productId/analise" element={<ProtectedRoute><ProductAnalysis /></ProtectedRoute>} />
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
