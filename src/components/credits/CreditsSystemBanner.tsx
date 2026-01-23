import { useCreditsSystem } from "@/hooks/useCreditsSystem";
import { X, FlaskConical, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export const CreditsSystemBanner = () => {
  const { isAdminTesting, isSimulatingPartial, systemStatus, updateStatus } = useCreditsSystem();

  // Only show banner in test modes
  if (!isAdminTesting && !isSimulatingPartial) {
    return null;
  }

  const handleDeactivate = async () => {
    await updateStatus('inactive');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-14 md:top-16 left-0 right-0 z-40 bg-gradient-to-r from-amber-500/90 to-orange-500/90 backdrop-blur-sm border-b border-amber-400/50"
    >
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          {isSimulatingPartial ? (
            <>
              <UserMinus className="h-4 w-4" />
              <span className="text-sm font-medium">
                Simulando Membro Parcial - Você está vendo como um membro parcial veria
              </span>
            </>
          ) : (
            <>
              <FlaskConical className="h-4 w-4" />
              <span className="text-sm font-medium">
                Sistema de Créditos - Modo Teste (apenas admins veem)
              </span>
            </>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeactivate}
          className="text-white hover:bg-white/20 h-7"
        >
          <X className="h-4 w-4 mr-1" />
          Desativar
        </Button>
      </div>
    </motion.div>
  );
};
