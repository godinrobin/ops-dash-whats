import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface PaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPix: () => void;
  onSelectCard: () => void;
}

export function PaymentMethodModal({
  open,
  onOpenChange,
  onSelectPix,
  onSelectCard,
}: PaymentMethodModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-accent">
        <DialogHeader>
          <DialogTitle className="text-center">💰 Como deseja recarregar?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Opção PIX */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Button
              variant="outline"
              className="w-full h-auto p-4 flex items-start gap-4 hover:border-green-500 hover:bg-green-500/10 transition-all"
              onClick={onSelectPix}
            >
              <div className="p-3 rounded-lg bg-green-500/20">
                <QrCode className="h-6 w-6 text-green-500" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-lg">PIX</p>
                <p className="text-sm text-muted-foreground">
                  Pagamento instantâneo via QR Code
                </p>
              </div>
            </Button>
          </motion.div>

          {/* Opção Cartão */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Button
              variant="outline"
              className="w-full h-auto p-4 flex items-start gap-4 hover:border-accent hover:bg-accent/10 transition-all"
              onClick={onSelectCard}
            >
              <div className="p-3 rounded-lg bg-accent/20">
                <CreditCard className="h-6 w-6 text-accent" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-lg">Cartão de Crédito</p>
                <p className="text-sm text-muted-foreground">
                  Débito ou crédito via Stripe
                </p>
              </div>
            </Button>
          </motion.div>

          {/* Aviso sobre Automati-Zap */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">Dica para usuários do Automati-Zap</p>
                <p className="text-muted-foreground mt-1">
                  O <strong>cartão de crédito</strong> é a melhor opção se você usa instâncias do 
                  Automati-Zap, pois permite <strong>renovação automática</strong> das suas instâncias
                  sem precisar recarregar manualmente.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
