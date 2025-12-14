import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Check, Video, Users, MessageCircle, Zap, GraduationCap } from "lucide-react";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-accent">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-accent" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Função Exclusiva para Membros
          </DialogTitle>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
};
