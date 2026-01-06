import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, QrCode, AlertTriangle } from "lucide-react";
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

// QR code expiration time (UazAPI has 2 minute timeout)
const QR_EXPIRATION_MS = 100 * 1000; // 100 seconds to be safe

// Cache de QR Codes - short TTL to ensure fresh QRs
const qrCodeCache: Map<string, { qrCode: string; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds cache

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

export const clearQrCodeCache = (instanceName: string) => {
  qrCodeCache.delete(instanceName);
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
  const [qrExpired, setQrExpired] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [timeToExpire, setTimeToExpire] = useState<number | null>(null);
  
  const autoCheckRef = useRef<NodeJS.Timeout | null>(null);
  const expirationRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const qrReceivedAtRef = useRef<number | null>(null);

  // Track when QR code was received and start expiration timer
  useEffect(() => {
    if (qrCode && open && !loading) {
      // New QR code received - reset expiration tracking
      qrReceivedAtRef.current = Date.now();
      setQrExpired(false);
      setTimeToExpire(Math.ceil(QR_EXPIRATION_MS / 1000));
      
      // Clear previous timers
      if (expirationRef.current) clearTimeout(expirationRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      
      // Set expiration timer
      expirationRef.current = setTimeout(() => {
        console.log('[QRCodeModal] QR code expired, triggering auto-refresh...');
        setQrExpired(true);
        handleAutoRefresh();
      }, QR_EXPIRATION_MS);
      
      // Countdown timer for UI
      countdownRef.current = setInterval(() => {
        if (qrReceivedAtRef.current) {
          const elapsed = Date.now() - qrReceivedAtRef.current;
          const remaining = Math.max(0, Math.ceil((QR_EXPIRATION_MS - elapsed) / 1000));
          setTimeToExpire(remaining);
          
          if (remaining <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
          }
        }
      }, 1000);
    }
    
    return () => {
      if (expirationRef.current) clearTimeout(expirationRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [qrCode, open, loading]);

  // Auto-refresh when QR expires
  const handleAutoRefresh = useCallback(async () => {
    if (!onRefreshQr || autoRefreshing) return;
    
    console.log('[QRCodeModal] Auto-refreshing expired QR code...');
    setAutoRefreshing(true);
    clearQrCodeCache(instanceName);
    
    try {
      await onRefreshQr();
    } catch (error) {
      console.error('[QRCodeModal] Auto-refresh failed:', error);
    } finally {
      setAutoRefreshing(false);
    }
  }, [onRefreshQr, instanceName, autoRefreshing]);

  // Auto-check status every 3 seconds while modal is open (faster feedback)
  useEffect(() => {
    if (open && qrCode && !loading && !qrExpired) {
      autoCheckRef.current = setInterval(() => {
        if (!localChecking && !checkingStatus && !autoRefreshing) {
          handleCheckStatus(true);
        }
      }, 3000); // Reduced from 5s to 3s for faster feedback
    }

    return () => {
      if (autoCheckRef.current) {
        clearInterval(autoCheckRef.current);
      }
    };
  }, [open, qrCode, loading, qrExpired, autoRefreshing]);

  const handleCheckStatus = async (silent = false) => {
    if (!silent) setLocalChecking(true);
    try {
      await onCheckStatus();
    } finally {
      if (!silent) setLocalChecking(false);
    }
  };

  const handleClose = () => {
    if (autoCheckRef.current) clearInterval(autoCheckRef.current);
    if (expirationRef.current) clearTimeout(expirationRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    qrReceivedAtRef.current = null;
    setTimeToExpire(null);
    setQrExpired(false);
    onOpenChange(false);
  };

  const handleManualRefresh = async () => {
    if (!onRefreshQr) return;
    setQrExpired(false);
    clearQrCodeCache(instanceName);
    await onRefreshQr();
  };

  const formatQrCodeSrc = (qr: string) => {
    if (qr.startsWith('data:')) return qr;
    return `data:image/png;base64,${qr}`;
  };

  const isRefreshing = loading || autoRefreshing;

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
          {isRefreshing ? (
            <div className="flex flex-col items-center gap-4 w-full">
              {/* Skeleton animado do QR Code */}
              <div className="relative mx-auto">
                <Skeleton className="w-64 h-64 rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {autoRefreshing ? 'Atualizando QR Code' : 'Gerando QR Code'}
                      </p>
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
              <div className="border rounded-lg p-4 bg-white shadow-sm mx-auto relative">
                <img
                  src={formatQrCodeSrc(qrCode)}
                  alt="QR Code"
                  className="w-64 h-64 object-contain"
                />
                {/* Countdown indicator */}
                {timeToExpire !== null && timeToExpire > 0 && (
                  <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 bg-background border rounded-full px-3 py-1 text-xs flex items-center gap-1.5">
                    {timeToExpire <= 30 && (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    )}
                    <span className={timeToExpire <= 30 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                      {timeToExpire}s
                    </span>
                  </div>
                )}
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Abra o <strong>WhatsApp</strong> &gt; Menu &gt; <strong>Dispositivos conectados</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Status verificado automaticamente
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
                <Button variant="outline" size="sm" onClick={handleManualRefresh}>
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
          {onRefreshQr && qrCode && !isRefreshing && (
            <Button variant="ghost" size="sm" onClick={handleManualRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
          )}
          <Button 
            onClick={() => handleCheckStatus(false)} 
            disabled={checkingStatus || localChecking || isRefreshing || !qrCode}
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
