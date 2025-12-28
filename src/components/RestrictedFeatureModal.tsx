import { Button } from "@/components/ui/button";
import { Lock, Check, Video, Users, MessageCircle, Zap, GraduationCap, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RestrictedFeatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
}

export const RestrictedFeatureModal = ({ 
  open, 
  onOpenChange, 
  featureName 
}: RestrictedFeatureModalProps) => {
  const handleBecomeMember = () => {
    window.open("https://pay.hub.la/FOZov2lAQqZD6wZNw1Hz", "_blank");
  };

  const benefits = [
    {
      icon: GraduationCap,
      text: "Acesso ao treinamento do X1 do básico ao avançado"
    },
    {
      icon: Video,
      text: "Acesso a todas as calls gravadas da comunidade"
    },
    {
      icon: Users,
      text: "Acesso a call ao vivo"
    },
    {
      icon: MessageCircle,
      text: "Acesso ao nosso grupo de networking no WhatsApp"
    },
    {
      icon: Zap,
      text: "Acesso a todas as funções ilimitadas do Zapdata"
    }
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Custom overlay that starts below the header */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-14 md:top-16 bg-black/80 z-40"
            onClick={() => onOpenChange(false)}
          />
          
          {/* Modal content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 top-14 md:top-16 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="w-full max-w-md p-6 bg-background border border-accent rounded-lg shadow-lg mx-4 pointer-events-auto relative">
              {/* Close button */}
              <button
                onClick={() => onOpenChange(false)}
                className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center mb-4">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-center">
                  Função Exclusiva para Membros
                </h2>
              </div>

              <div className="space-y-6">
                <p className="text-center text-muted-foreground">
                  {featureName ? (
                    <>O <span className="font-semibold text-foreground">{featureName}</span> está disponível apenas para membros da comunidade.</>
                  ) : (
                    <>Esta função está disponível apenas para membros da comunidade.</>
                  )}
                </p>

                <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-center mb-4">
                    Benefícios de ser membro:
                  </h4>
                  {benefits.map((benefit, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                      <span className="text-sm">{benefit.text}</span>
                    </div>
                  ))}
                </div>

                <Button 
                  onClick={handleBecomeMember}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-6 text-lg"
                >
                  Seja Membro
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
