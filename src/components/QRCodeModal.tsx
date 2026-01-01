import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, QrCode } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  qrCode: string | null;
  loading: boolean;
  onCheckStatus: () => Promise<void>;
  onRefreshQr?: () => Promise<void>;
  checkingStatus: boolean;
}

// Cache de QR Codes - 30 segundos de validade
const qrCodeCache: Map<string, { qrCode: string; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 1000; // 30 segundos

export const getQrCodeFromCache = (instanceName: string): string | null => {
  const cached = qrCodeCache.get(instanceName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.qrCode;
  }
  qrCodeCache.delete(instanceName);
  return null;
};

export const setQrCodeCache = (instanceName: string, qrCode: string) => {
  qrCodeCache.set(instanceName, { qrCode, timestamp: Date.now() });
};

export function QRCodeModal({
  open,
  onOpenChange,
  instanceName,
  qrCode,
  loading,
  onCheckStatus,
  onRefreshQr,
  checkingStatus,
}: QRCodeModalProps) {
  const [localChecking, setLocalChecking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const autoCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-check status a cada 5 segundos enquanto modal está aberto
  useEffect(() => {
    if (open && qrCode && !loading) {
      autoCheckRef.current = setInterval(() => {
        if (!localChecking && !checkingStatus) {
          handleCheckStatus(true);
        }
      }, 5000);
    }

    return () => {
      if (autoCheckRef.current) {
        clearInterval(autoCheckRef.current);
      }
    };
  }, [open, qrCode, loading]);

  const handleCheckStatus = async (silent = false) => {
    if (!silent) setLocalChecking(true);
    try {
      await onCheckStatus();
    } finally {
      if (!silent) setLocalChecking(false);
    }
  };

  const handleClose = () => {
    if (autoCheckRef.current) {
      clearInterval(autoCheckRef.current);
    }
    onOpenChange(false);
  };

  const formatQrCodeSrc = (qr: string) => {
    if (qr.startsWith('data:')) return qr;
    return `data:image/png;base64,${qr}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com seu WhatsApp para conectar o número
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-4 min-h-[320px] w-full">
          {loading ? (
            <div className="flex flex-col items-center gap-4 w-full">
              {/* Skeleton animado do QR Code */}
              <div className="relative mx-auto">
                <Skeleton className="w-64 h-64 rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Gerando QR Code</p>
                      <p className="text-xs text-muted-foreground mt-1">Aguarde alguns segundos...</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Barra de progresso animada */}
              <div className="w-64 h-1 bg-muted rounded-full overflow-hidden mx-auto">
                <div className="h-full bg-primary animate-pulse" style={{ 
                  animation: 'progress 2s ease-in-out infinite',
                }} />
              </div>
              <style>{`
                @keyframes progress {
                  0% { width: 0%; }
                  50% { width: 80%; }
                  100% { width: 100%; }
                }
              `}</style>
            </div>
          ) : showSuccess ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <CheckCircle2 className="h-16 w-16 text-green-500 animate-in zoom-in duration-300" />
              <p className="text-lg font-medium text-green-600">WhatsApp conectado!</p>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="border rounded-lg p-4 bg-white shadow-sm mx-auto">
                <img
                  src={formatQrCodeSrc(qrCode)}
                  alt="QR Code"
                  className="w-64 h-64 object-contain"
                />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Abra o <strong>WhatsApp</strong> &gt; Menu &gt; <strong>Dispositivos conectados</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  O status será verificado automaticamente
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <QrCode className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive">Erro ao carregar QR Code</p>
              {onRefreshQr && (
                <Button variant="outline" size="sm" onClick={onRefreshQr}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button 
            onClick={() => handleCheckStatus(false)} 
            disabled={checkingStatus || localChecking || loading || !qrCode}
          >
            {(checkingStatus || localChecking) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar Conexão
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
