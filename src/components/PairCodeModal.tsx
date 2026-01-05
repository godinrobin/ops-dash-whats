import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hash, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PairCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  onSuccess: () => void;
}

export function PairCodeModal({
  open,
  onOpenChange,
  instanceName,
  onSuccess,
}: PairCodeModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const autoCheckRef = useRef<NodeJS.Timeout | null>(null);
  const expirationRef = useRef<NodeJS.Timeout | null>(null);
  const [timeToExpire, setTimeToExpire] = useState<number | null>(null);
  const pairCodeReceivedAtRef = useRef<number | null>(null);

  // Pair code expires in 5 minutes for UAZAPI
  const PAIR_CODE_EXPIRATION_MS = 5 * 60 * 1000;

  // Track when pair code was received and start expiration timer
  useEffect(() => {
    if (pairCode && open) {
      pairCodeReceivedAtRef.current = Date.now();
      setTimeToExpire(Math.ceil(PAIR_CODE_EXPIRATION_MS / 1000));

      // Clear previous timers
      if (expirationRef.current) clearTimeout(expirationRef.current);

      // Set expiration timer
      expirationRef.current = setTimeout(() => {
        setPairCode(null);
        toast.warning("Código expirado. Gere um novo código.");
      }, PAIR_CODE_EXPIRATION_MS);

      // Countdown timer
      const countdownInterval = setInterval(() => {
        if (pairCodeReceivedAtRef.current) {
          const elapsed = Date.now() - pairCodeReceivedAtRef.current;
          const remaining = Math.max(0, Math.ceil((PAIR_CODE_EXPIRATION_MS - elapsed) / 1000));
          setTimeToExpire(remaining);

          if (remaining <= 0) {
            clearInterval(countdownInterval);
          }
        }
      }, 1000);

      return () => {
        clearInterval(countdownInterval);
      };
    }

    return () => {
      if (expirationRef.current) clearTimeout(expirationRef.current);
    };
  }, [pairCode, open]);

  // Auto-check status every 5 seconds while modal is open and pair code is active
  useEffect(() => {
    if (open && pairCode && !loading) {
      autoCheckRef.current = setInterval(() => {
        if (!checkingStatus) {
          handleCheckStatus(true);
        }
      }, 5000);
    }

    return () => {
      if (autoCheckRef.current) {
        clearInterval(autoCheckRef.current);
      }
    };
  }, [open, pairCode, loading]);

  const handleGeneratePairCode = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Digite o número de telefone");
      return;
    }

    // Clean phone number - remove all non-digits
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      toast.error("Número de telefone inválido. Use o formato internacional (ex: 5511999999999)");
      return;
    }

    setLoading(true);
    setPairCode(null);

    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: {
          action: 'connect-paircode',
          instanceName,
          phone: cleanedPhone,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.paircode || data.pairCode) {
        setPairCode(data.paircode || data.pairCode);
        toast.success("Código gerado! Use-o no WhatsApp.");
      } else if (data.status === 'connected' || data.connected) {
        setShowSuccess(true);
        toast.success("WhatsApp já está conectado!");
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 1500);
      } else {
        throw new Error("Código de pareamento não recebido");
      }
    } catch (error: any) {
      console.error('Error generating pair code:', error);
      toast.error(error.message || 'Erro ao gerar código');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async (silent = false) => {
    if (!silent) setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('maturador-evolution', {
        body: { action: 'check-status', instanceName },
      });

      if (error) throw error;

      // Check for connected status based on UazAPI response format
      // UazAPI /instance/status returns: { status: { connected: true, jid: "..." }, instance: {...} }
      const statusConnected = data?.status?.connected === true;
      const statusState = data?.status?.state;
      const instanceState = data?.instance?.state;
      const instanceStatus = data?.instance?.status;
      
      // Only consider connected if explicitly connected, NOT if connecting
      const isConnecting = statusState === 'connecting' || instanceState === 'connecting' || instanceStatus === 'connecting';
      const isConnected = !isConnecting && (
        statusConnected ||
        statusState === 'open' ||
        instanceState === 'open' ||
        instanceStatus === 'connected' ||
        data?.connected === true
      );

      if (isConnected) {
        setShowSuccess(true);
        if (!silent) toast.success('WhatsApp conectado com sucesso!');
        setTimeout(() => {
          onSuccess();
          handleClose();
        }, 1500);
      } else if (!silent) {
        toast.info('Aguardando vinculação do código...');
      }
    } catch (error: any) {
      console.error('Error checking status:', error);
    } finally {
      if (!silent) setCheckingStatus(false);
    }
  };

  const handleCopyCode = () => {
    if (pairCode) {
      navigator.clipboard.writeText(pairCode);
      toast.success("Código copiado!");
    }
  };

  const handleClose = () => {
    if (autoCheckRef.current) clearInterval(autoCheckRef.current);
    if (expirationRef.current) clearTimeout(expirationRef.current);
    pairCodeReceivedAtRef.current = null;
    setTimeToExpire(null);
    setPairCode(null);
    setPhoneNumber("");
    setShowSuccess(false);
    onOpenChange(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            <Hash className="h-5 w-5 text-primary" />
            Conectar por Código
          </DialogTitle>
          <DialogDescription className="text-center">
            Conecte seu WhatsApp usando um código de 8 dígitos
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-4 min-h-[200px] w-full">
          {showSuccess ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <CheckCircle2 className="h-16 w-16 text-green-500 animate-in zoom-in duration-300" />
              <p className="text-lg font-medium text-green-600 text-center">WhatsApp conectado!</p>
            </div>
          ) : pairCode ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  No seu celular, abra o WhatsApp e vá em:
                </p>
                <p className="text-sm text-center leading-relaxed">
                  <strong className="text-foreground">Configurações</strong> &gt; <strong className="text-foreground">Dispositivos conectados</strong> &gt; <strong className="text-foreground">Conectar um dispositivo</strong> &gt; <strong className="text-foreground">Conectar com número de telefone</strong>
                </p>
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="text-4xl font-mono font-bold tracking-widest bg-muted px-6 py-4 rounded-lg">
                    {pairCode}
                  </div>
                  <Button variant="outline" size="icon" onClick={handleCopyCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {timeToExpire !== null && timeToExpire > 0 && (
                  <p className="text-sm text-muted-foreground text-center">
                    Expira em: <span className={timeToExpire <= 60 ? 'text-amber-600 font-medium' : ''}>{formatTime(timeToExpire)}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  O status é verificado automaticamente a cada 5 segundos
                </p>
              </div>

              {/* Botões centralizados quando código está visível */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-4 w-full">
                <Button variant="outline" onClick={handleClose}>
                  Fechar
                </Button>
                <Button variant="ghost" onClick={() => setPairCode(null)}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Novo Código
                </Button>
                <Button
                  onClick={() => handleCheckStatus(false)}
                  disabled={checkingStatus}
                >
                  {checkingStatus ? (
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
              </div>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-center block">Número de Telefone</Label>
                <Input
                  id="phone"
                  placeholder="5511999999999"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                  className="text-center"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Formato internacional com código do país (ex: 5511999999999)
                </p>
              </div>

              {/* Botões centralizados na tela de input */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Fechar
                </Button>
                <Button onClick={handleGeneratePairCode} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Hash className="h-4 w-4 mr-2" />
                      Gerar Código
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
