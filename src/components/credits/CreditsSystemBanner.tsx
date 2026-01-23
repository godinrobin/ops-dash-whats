import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { X, FlaskConical, UserMinus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export const CreditsSystemBanner = () => {
  const { isAdminTesting, isSimulatingPartial, systemStatus, updateStatus, loading } = useCreditsSystem();

  // Only show banner in test modes
  const showBanner = isAdminTesting || isSimulatingPartial;

  const handleDeactivate = async () => {
    const success = await updateStatus('inactive');
    if (success) {
      toast.success('Modo de teste desativado');
    }
  };

  return (
    <AnimatePresence>
      {showBanner && !loading && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-14 md:top-16 left-0 right-0 z-50"
        >
          <div className={`w-full py-2.5 px-4 ${
            isSimulatingPartial 
              ? 'bg-gradient-to-r from-purple-600 to-purple-500' 
              : 'bg-gradient-to-r from-amber-500 to-orange-500'
          } shadow-lg`}>
            <div className="container mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <div className={`p-1.5 rounded-full ${
                  isSimulatingPartial ? 'bg-purple-700/50' : 'bg-amber-600/50'
                }`}>
                  {isSimulatingPartial ? (
                    <UserMinus className="h-4 w-4" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="font-semibold text-sm">
                    {isSimulatingPartial ? 'Simulação: Membro Parcial' : 'Modo Teste Admin'}
                  </span>
                  <span className="text-xs text-white/80 hidden sm:inline">
                    {isSimulatingPartial 
                      ? 'Você está vendo exatamente como um membro parcial veria (0 instâncias grátis, sistemas bloqueados)'
                      : 'Sistema de créditos ativo apenas para você. Teste todas as funcionalidades.'
                    }
                  </span>
                </div>
              </div>
              
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeactivate}
                className="h-7 text-xs font-medium bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <X className="h-3 w-3 mr-1" />
                Desativar
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
