import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Taxa de conversão USD para BRL
const USD_TO_BRL = 6.10;

// Serviços mais populares com nomes em português
const popularServices: Record<string, string> = {
  'wa': 'WhatsApp',
  'tg': 'Telegram',
  'ig': 'Instagram',
  'go': 'Google/Gmail',
  'fb': 'Facebook',
  'tw': 'Twitter/X',
  'oi': 'Tinder',
  'am': 'Amazon',
  'mb': 'Microsoft',
  'nf': 'Netflix',
  'ub': 'Uber',
  'ds': 'Discord',
  'sp': 'Spotify',
  'ya': 'Yahoo',
  'vi': 'Viber',
  'me': 'Mercado Livre',
  'sn': 'Snapchat',
  'tk': 'TikTok',
  'li': 'LinkedIn',
  'py': 'PayPal',
};

// Países principais com bandeiras - CÓDIGOS SÃO IDs DA API SMS-ACTIVATE, NÃO DDIs
const countries: Record<string, { name: string; flag: string }> = {
  '0': { name: 'Rússia', flag: '🇷🇺' },
  '1': { name: 'Ucrânia', flag: '🇺🇦' },
  '2': { name: 'Cazaquistão', flag: '🇰🇿' },
  '3': { name: 'China', flag: '🇨🇳' },
  '4': { name: 'Filipinas', flag: '🇵🇭' },
  '6': { name: 'Indonésia', flag: '🇮🇩' },
  '12': { name: 'Estados Unidos', flag: '🇺🇸' },
  '16': { name: 'Reino Unido', flag: '🇬🇧' },
  '19': { name: 'Espanha', flag: '🇪🇸' },
  '33': { name: 'França', flag: '🇫🇷' },
  '34': { name: 'México', flag: '🇲🇽' },
  '39': { name: 'Argentina', flag: '🇦🇷' },
  '43': { name: 'Alemanha', flag: '🇩🇪' },
  '54': { name: 'Turquia', flag: '🇹🇷' },
  '73': { name: 'Brasil', flag: '🇧🇷' },
  '77': { name: 'Índia', flag: '🇮🇳' },
  '84': { name: 'Vietnã', flag: '🇻🇳' },
  '117': { name: 'Portugal', flag: '🇵🇹' },
  '15': { name: 'Polônia', flag: '🇵🇱' },
  '53': { name: 'Nigéria', flag: '🇳🇬' },
  '31': { name: 'África do Sul', flag: '🇿🇦' },
};

async function getMarginFromDatabase(): Promise<number> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('platform_margins')
      .select('margin_percent')
      .eq('system_name', 'sms')
      .single();
    
    if (error || !data) {
      console.log('Using default margin (30%)');
      return 30;
    }
    
    return data.margin_percent;
  } catch (err) {
    console.error('Error fetching margin:', err);
    return 30; // Default 30%
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SMS_ACTIVATE_API_KEY');
    if (!apiKey) {
      throw new Error('SMS_ACTIVATE_API_KEY não configurada');
    }

    const { action, country } = await req.json();

    if (action === 'getCountries') {
      const countryList = Object.entries(countries).map(([code, data]) => ({
        code,
        name: data.name,
        flag: data.flag,
      }));
      
      return new Response(JSON.stringify({ countries: countryList }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getServices') {
      // Get margin from database
      const marginPercent = await getMarginFromDatabase();
      const marginMultiplier = 1 + (marginPercent / 100); // e.g., 30% -> 1.30
      
      console.log(`Using margin: ${marginPercent}% (multiplier: ${marginMultiplier})`);
      
      const countryCode = country || '73';
      const url = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getPrices&country=${countryCode}`;
      
      console.log('Fetching prices for country:', countryCode);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('API response:', JSON.stringify(data).substring(0, 500));
      
      if (data.error) {
        throw new Error(data.error);
      }

      const services: Array<{
        code: string;
        name: string;
        priceUsd: number;
        priceBrl: number;
        priceWithMarkup: number;
        available: number;
      }> = [];

      const countryData = data[countryCode];
      if (countryData) {
        for (const [serviceCode, serviceData] of Object.entries(countryData)) {
          const sData = serviceData as { cost: number; count: number };
          const priceUsd = sData.cost;
          const available = sData.count;
          
          if (available > 0) {
            // Preço base em BRL
            const priceBrlBase = priceUsd * USD_TO_BRL;
            // Preço com margem (exibido ao usuário)
            const priceWithMarkup = Math.ceil(priceBrlBase * marginMultiplier * 100) / 100;
            
            services.push({
              code: serviceCode,
              name: popularServices[serviceCode] || serviceCode.toUpperCase(),
              priceUsd,
              priceBrl: priceBrlBase,
              priceWithMarkup,
              available,
            });
          }
        }
      }

      services.sort((a, b) => {
        const aIsPopular = popularServices[a.code] ? 0 : 1;
        const bIsPopular = popularServices[b.code] ? 0 : 1;
        if (aIsPopular !== bIsPopular) return aIsPopular - bIsPopular;
        return a.priceWithMarkup - b.priceWithMarkup;
      });

      return new Response(JSON.stringify({ services, marginPercent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in sms-get-services:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});