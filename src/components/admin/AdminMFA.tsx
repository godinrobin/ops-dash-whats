import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const AdminMFA = () => {
  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkMFAStatus();
  }, []);

  const checkMFAStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactors = data.totp || [];
      const verifiedFactor = totpFactors.find(f => (f as any).status === 'verified');
      
      if (verifiedFactor) {
        setMfaEnabled(true);
        setFactorId(verifiedFactor.id);
      } else {
        setMfaEnabled(false);
        setFactorId(null);
        // Clean up ALL unverified factors to prevent QR code regeneration errors
        const unverifiedFactors = totpFactors.filter(f => (f as any).status === 'unverified');
        for (const factor of unverifiedFactors) {
          try {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          } catch (e) {
            console.log('Error cleaning up unverified factor:', e);
          }
        }
      }
      // Reset enrollment state on check
      setEnrolling(false);
      setQrCode(null);
      setSecret(null);
      setVerifyCode('');
    } catch (error) {
      console.error('Error checking MFA status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEnrollment = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Google Authenticator',
      });

      if (error) throw error;

      if (data.type === 'totp') {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      }
    } catch (error: any) {
      console.error('Error enrolling MFA:', error);
      toast.error('Erro ao iniciar configuração do 2FA');
      setEnrolling(false);
    }
  };

  const verifyAndActivate = async () => {
    if (!factorId || verifyCode.length !== 6) return;

    setVerifying(true);
    try {
      // First create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      // Then verify the challenge with the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyError) throw verifyError;

      toast.success('2FA ativado com sucesso!');
      setMfaEnabled(true);
      setQrCode(null);
      setSecret(null);
      setEnrolling(false);
      setVerifyCode('');
    } catch (error: any) {
      console.error('Error verifying MFA:', error);
      toast.error(error.message || 'Código inválido. Tente novamente.');
    } finally {
      setVerifying(false);
    }
  };

  const disableMFA = async () => {
    if (!factorId) return;

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;

      toast.success('2FA desativado com sucesso');
      setMfaEnabled(false);
      setFactorId(null);
    } catch (error: any) {
      console.error('Error disabling MFA:', error);
      toast.error('Erro ao desativar 2FA');
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Código copiado!');
    }
  };

  const cancelEnrollment = async () => {
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId });
    }
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode('');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Autenticação de Dois Fatores (2FA)
        </CardTitle>
        <CardDescription>
          Adicione uma camada extra de segurança à sua conta usando o Google Authenticator
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Badge */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Status:</span>
          {mfaEnabled ? (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Ativado
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-muted">
              <ShieldOff className="h-3 w-3 mr-1" />
              Desativado
            </Badge>
          )}
        </div>

        {/* MFA Already Enabled */}
        {mfaEnabled && !enrolling && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sua conta está protegida com autenticação de dois fatores.
            </p>
            
            {/* Trusted Devices Section */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dispositivos Confiáveis</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Dispositivos marcados como "confiáveis" não precisam inserir o código 2FA ao fazer login.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  localStorage.removeItem('mfa_trusted_devices');
                  toast.success('Todos os dispositivos confiáveis foram removidos');
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover todos os dispositivos confiáveis
              </Button>
            </div>
            
            <Button variant="destructive" onClick={disableMFA}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Desativar 2FA
            </Button>
          </div>
        )}

        {/* Not Enabled - Show Activate Button */}
        {!mfaEnabled && !enrolling && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Proteja sua conta com autenticação de dois fatores. Você precisará do Google Authenticator ou 
              outro app compatível com TOTP.
            </p>
            <Button onClick={startEnrollment}>
              <Shield className="h-4 w-4 mr-2" />
              Ativar 2FA
            </Button>
          </div>
        )}

        {/* Enrollment in Progress */}
        {enrolling && qrCode && (
          <div className="space-y-6">
            <div className="bg-muted/50 p-6 rounded-lg space-y-4">
              <h4 className="font-medium">1. Escaneie o QR Code</h4>
              <p className="text-sm text-muted-foreground">
                Abra o Google Authenticator e escaneie o código abaixo:
              </p>
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>
            </div>

            <div className="bg-muted/50 p-6 rounded-lg space-y-4">
              <h4 className="font-medium">2. Ou use o código manualmente</h4>
              <p className="text-sm text-muted-foreground">
                Se não conseguir escanear, insira este código no seu app:
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-background px-3 py-2 rounded border font-mono text-sm flex-1 break-all">
                  {secret}
                </code>
                <Button size="sm" variant="outline" onClick={copySecret}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-muted/50 p-6 rounded-lg space-y-4">
              <h4 className="font-medium">3. Confirme o código</h4>
              <p className="text-sm text-muted-foreground">
                Digite o código de 6 dígitos gerado pelo app:
              </p>
              <div className="flex justify-center">
                <InputOTP 
                  maxLength={6} 
                  value={verifyCode} 
                  onChange={setVerifyCode}
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                >
                  <InputOTPGroup className="gap-2">
                    <InputOTPSlot index={0} className="w-12 h-12 text-lg border-2" />
                    <InputOTPSlot index={1} className="w-12 h-12 text-lg border-2" />
                    <InputOTPSlot index={2} className="w-12 h-12 text-lg border-2" />
                    <InputOTPSlot index={3} className="w-12 h-12 text-lg border-2" />
                    <InputOTPSlot index={4} className="w-12 h-12 text-lg border-2" />
                    <InputOTPSlot index={5} className="w-12 h-12 text-lg border-2" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={verifyAndActivate} 
                disabled={verifyCode.length !== 6 || verifying}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Ativar 2FA
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={cancelEnrollment}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
