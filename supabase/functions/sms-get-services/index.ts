import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Taxa de conversão USD para BRL (aproximada) + margem de lucro
// A API SMS-Activate retorna preços em USD, não em RUB
const USD_TO_BRL = 6.10; // 1 USD = ~6.10 BRL
const PROFIT_MARGIN = 1.30; // 30% de margem

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

// Países principais com bandeiras
const countries: Record<string, { name: string; flag: string }> = {
  '73': { name: 'Rússia', flag: '🇷🇺' },
  '12': { name: 'Estados Unidos', flag: '🇺🇸' },
  '16': { name: 'Reino Unido', flag: '🇬🇧' },
  '39': { name: 'Brasil', flag: '🇧🇷' },
  '62': { name: 'Indonésia', flag: '🇮🇩' },
  '86': { name: 'China', flag: '🇨🇳' },
  '91': { name: 'Índia', flag: '🇮🇳' },
  '52': { name: 'México', flag: '🇲🇽' },
  '63': { name: 'Filipinas', flag: '🇵🇭' },
  '84': { name: 'Vietnã', flag: '🇻🇳' },
  '351': { name: 'Portugal', flag: '🇵🇹' },
  '34': { name: 'Espanha', flag: '🇪🇸' },
  '33': { name: 'França', flag: '🇫🇷' },
  '49': { name: 'Alemanha', flag: '🇩🇪' },
  '7': { name: 'Cazaquistão', flag: '🇰🇿' },
  '380': { name: 'Ucrânia', flag: '🇺🇦' },
  '48': { name: 'Polônia', flag: '🇵🇱' },
  '90': { name: 'Turquia', flag: '🇹🇷' },
  '234': { name: 'Nigéria', flag: '🇳🇬' },
  '27': { name: 'África do Sul', flag: '🇿🇦' },
};

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
      // Retorna lista de países disponíveis
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
      // Busca preços da API SMS-Activate
      const countryCode = country || '73';
      const url = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${apiKey}&action=getPrices&country=${countryCode}`;
      
      console.log('Fetching prices for country:', countryCode);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('API response:', JSON.stringify(data).substring(0, 500));
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Formata os serviços com preços convertidos
      const services: Array<{
        code: string;
        name: string;
        priceUsd: number;
        priceBrl: number;
        available: number;
      }> = [];

      const countryData = data[countryCode];
      if (countryData) {
        for (const [serviceCode, serviceData] of Object.entries(countryData)) {
          const sData = serviceData as { cost: number; count: number };
          const priceUsd = sData.cost;
          const available = sData.count;
          
          // Só adiciona se tiver números disponíveis
          if (available > 0) {
            const priceBrl = Math.ceil(priceUsd * USD_TO_BRL * PROFIT_MARGIN * 100) / 100;
            
            services.push({
              code: serviceCode,
              name: popularServices[serviceCode] || serviceCode.toUpperCase(),
              priceUsd,
              priceBrl,
              available,
            });
          }
        }
      }

      // Ordena por popularidade (serviços conhecidos primeiro) e depois por preço
      services.sort((a, b) => {
        const aIsPopular = popularServices[a.code] ? 0 : 1;
        const bIsPopular = popularServices[b.code] ? 0 : 1;
        if (aIsPopular !== bIsPopular) return aIsPopular - bIsPopular;
        return a.priceBrl - b.priceBrl;
      });

      return new Response(JSON.stringify({ services }), {
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
