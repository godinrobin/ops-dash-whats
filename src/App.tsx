import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Home from "./pages/Home";
import Index from "./pages/Index";
import ProductMetrics from "./pages/ProductMetrics";
import NumberOrganizer from "./pages/NumberOrganizer";
import TrackOfertas from "./pages/TrackOfertas";
import DepoimentosGenerator from "./pages/DepoimentosGenerator";
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
            <Route path="/gerador-depoimentos" element={<ProtectedRoute><DepoimentosGenerator /></ProtectedRoute>} />
            <Route path="/produto/:productId" element={<ProtectedRoute><ProductMetrics /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
