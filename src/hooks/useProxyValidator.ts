import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ProxyValidationResult {
  valid: boolean;
  ip?: string;
  location?: string;
  country?: string;
  city?: string;
  isp?: string;
  latency_ms?: number;
  error?: string;
}

export function useProxyValidator() {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ProxyValidationResult | null>(null);

  // Parse SOCKS5 string format: socks5://username:password@host:port
  const parseSocks5String = (str: string) => {
    try {
      const regex = /^socks5:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/;
      const match = str.match(regex);
      if (match) {
        return {
          protocol: 'socks5',
          username: match[1],
          password: match[2],
          host: match[3],
          port: match[4]
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const validateProxy = async (proxyString: string): Promise<ProxyValidationResult | null> => {
    const parsed = parseSocks5String(proxyString);
    if (!parsed) {
      toast.error('Formato de proxy inválido. Use: socks5://usuario:senha@host:porta');
      return null;
    }

    setValidating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('pyproxy-purchase', {
        body: { 
          action: 'validate-proxy',
          host: parsed.host,
          port: parsed.port,
          username: parsed.username,
          password: parsed.password
        }
      });

      if (error) {
        const errorMessage = (error as any)?.context?.body?.error || error.message;
        const validationResult: ProxyValidationResult = {
          valid: false,
          error: errorMessage
        };
        setResult(validationResult);
        toast.error(`Erro ao validar proxy: ${errorMessage}`);
        return validationResult;
      }

      if (data?.success && data?.validation) {
        const ip = data.validation.ip;
        const isRealIp = ip && ip !== 'unknown' && ip !== 'credentials_valid' && /^\d+\.\d+\.\d+\.\d+$/.test(ip);
        const location = data.validation.location || 
          [data.validation.city, data.validation.country].filter(Boolean).join(', ') || 
          '';
        
        const validationResult: ProxyValidationResult = {
          valid: true,
          ip: isRealIp ? ip : (ip === 'credentials_valid' ? 'Credenciais válidas' : ip),
          location: location,
          country: data.validation.country,
          city: data.validation.city,
          isp: data.validation.isp,
          latency_ms: data.validation.latency_ms
        };
        setResult(validationResult);
        
        if (isRealIp) {
          toast.success(`Proxy válida! IP: ${ip}${location ? ` (${location})` : ''}`);
        } else if (ip === 'credentials_valid') {
          toast.success('Proxy válida! Credenciais verificadas.');
        } else {
          toast.success('Proxy válida!');
        }
        return validationResult;
      } else {
        const validationResult: ProxyValidationResult = {
          valid: false,
          error: data?.error || 'Não foi possível validar a proxy'
        };
        setResult(validationResult);
        toast.error(validationResult.error);
        return validationResult;
      }
    } catch (err: any) {
      const validationResult: ProxyValidationResult = {
        valid: false,
        error: err.message || 'Erro ao validar proxy'
      };
      setResult(validationResult);
      toast.error(validationResult.error);
      return validationResult;
    } finally {
      setValidating(false);
    }
  };

  const clearResult = () => {
    setResult(null);
  };

  return {
    validateProxy,
    validating,
    result,
    clearResult,
    parseSocks5String
  };
}
