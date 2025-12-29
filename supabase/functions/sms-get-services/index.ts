import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hero SMS API base URL
const HERO_SMS_API_URL = 'https://hero-sms.com/stubs/handler_api.php';

// Taxa de conversão USD para BRL
const USD_TO_BRL = 6.10;

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
    return 30;
  }
}

// Buscar lista de serviços da API Hero SMS
async function getServicesListFromAPI(apiKey: string, country: string): Promise<Record<string, string>> {
  const url = `${HERO_SMS_API_URL}?api_key=${apiKey}&action=getServicesList&country=${country}&lang=pt`;
  
  console.log('Fetching services list from Hero SMS for country:', country);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('Hero SMS getServicesList response:', JSON.stringify(data).substring(0, 500));
    
    if (data.status === 'success' && Array.isArray(data.services)) {
      const servicesMap: Record<string, string> = {};
      for (const service of data.services) {
        if (service.code && service.name) {
          servicesMap[service.code] = service.name;
        }
      }
      console.log(`Loaded ${Object.keys(servicesMap).length} services from API`);
      return servicesMap;
    }
    
    console.error('Invalid services list response:', data);
    return {};
  } catch (err) {
    console.error('Error fetching services list:', err);
    return {};
  }
}

// Buscar lista de países da API Hero SMS
async function getCountriesFromAPI(apiKey: string): Promise<Array<{ code: string; name: string; flag: string }>> {
  const url = `${HERO_SMS_API_URL}?api_key=${apiKey}&action=getCountries`;
  
  console.log('Fetching countries from Hero SMS');
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('Hero SMS getCountries response:', JSON.stringify(data).substring(0, 500));
    
    if (Array.isArray(data)) {
      // Mapa de bandeiras por ID de país
      const flagMap: Record<string, string> = {
        '0': '🇷🇺', '1': '🇺🇦', '2': '🇰🇿', '3': '🇨🇳', '4': '🇵🇭',
        '6': '🇮🇩', '12': '🇺🇸', '16': '🇬🇧', '19': '🇪🇸', '33': '🇫🇷',
        '34': '🇲🇽', '39': '🇦🇷', '43': '🇩🇪', '54': '🇹🇷', '73': '🇧🇷',
        '77': '🇮🇳', '84': '🇻🇳', '117': '🇵🇹', '15': '🇵🇱', '53': '🇳🇬',
        '31': '🇿🇦', '5': '🇧🇾', '7': '🇲🇾', '8': '🇰🇬', '9': '🇨🇦',
        '10': '🇦🇺', '11': '🇮🇱', '13': '🇦🇪', '14': '🇵🇰', '17': '🇭🇰',
        '18': '🇧🇩', '20': '🇷🇴', '21': '🇳🇱', '22': '🇪🇬', '23': '🇸🇬',
        '24': '🇳🇵', '25': '🇵🇪', '26': '🇨🇴', '27': '🇮🇶', '28': '🇸🇦',
        '29': '🇦🇫', '30': '🇹🇿', '32': '🇰🇪', '35': '🇲🇲', '36': '🇮🇹',
      };
      
      const countries = data
        .filter((c: any) => c.visible === 1)
        .map((c: any) => ({
          code: String(c.id),
          name: c.eng || c.rus || `Country ${c.id}`,
          flag: flagMap[String(c.id)] || '🏳️',
        }))
        .sort((a: any, b: any) => {
          // Brasil primeiro
          if (a.code === '73') return -1;
          if (b.code === '73') return 1;
          return a.name.localeCompare(b.name);
        });
      
      console.log(`Loaded ${countries.length} countries from API`);
      return countries;
    }
    
    console.error('Invalid countries response:', data);
    return [];
  } catch (err) {
    console.error('Error fetching countries:', err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('HERO_SMS_API_KEY');
    if (!apiKey) {
      throw new Error('HERO_SMS_API_KEY não configurada');
    }

    let action = '';
    let country = '73';
    
    try {
      const body = await req.json();
      action = body.action || '';
      country = body.country || '73';
    } catch {
      return new Response(JSON.stringify({ prefetch: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getCountries') {
      const countries = await getCountriesFromAPI(apiKey);
      
      return new Response(JSON.stringify({ countries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getServices') {
      const marginPercent = await getMarginFromDatabase();
      const marginMultiplier = 1 + (marginPercent / 100);
      
      console.log(`Using margin: ${marginPercent}% (multiplier: ${marginMultiplier})`);
      
      const countryCode = country || '73';
      
      // Buscar serviços e preços em paralelo
      const [servicesMap, pricesResponse] = await Promise.all([
        getServicesListFromAPI(apiKey, countryCode),
        fetch(`${HERO_SMS_API_URL}?api_key=${apiKey}&action=getPrices&country=${countryCode}`)
      ]);
      
      const pricesText = await pricesResponse.text();
      
      if (!pricesText || pricesText.trim() === '') {
        console.error('Empty response from Hero SMS getPrices API');
        return new Response(JSON.stringify({ services: [], marginPercent, error: 'API retornou resposta vazia' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      let pricesData;
      try {
        pricesData = JSON.parse(pricesText);
      } catch (parseError) {
        console.error('Failed to parse getPrices response:', pricesText.substring(0, 200));
        return new Response(JSON.stringify({ services: [], marginPercent, error: 'Resposta inválida da API' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log('Hero SMS getPrices response:', JSON.stringify(pricesData).substring(0, 500));
      
      if (pricesData.error) {
        throw new Error(pricesData.error);
      }

      const services: Array<{
        code: string;
        name: string;
        priceUsd: number;
        priceBrl: number;
        priceWithMarkup: number;
        available: number;
      }> = [];

      const countryData = pricesData[countryCode];
      if (countryData) {
        for (const [serviceCode, serviceData] of Object.entries(countryData)) {
          const sData = serviceData as { cost: number; count: number };
          const priceUsd = sData.cost;
          const available = sData.count;
          
          if (available > 0) {
            // Usar nome da API ou código como fallback
            const serviceName = servicesMap[serviceCode] || serviceCode.toUpperCase();
            
            // Preço base em BRL
            const priceBrlBase = priceUsd * USD_TO_BRL;
            // Preço com margem
            const priceWithMarkup = Math.ceil(priceBrlBase * marginMultiplier * 100) / 100;
            
            services.push({
              code: serviceCode,
              name: serviceName,
              priceUsd,
              priceBrl: priceBrlBase,
              priceWithMarkup,
              available,
            });
          }
        }
      }

      // Ordenar por preço
      services.sort((a, b) => a.priceWithMarkup - b.priceWithMarkup);

      console.log(`Returning ${services.length} services for country ${countryCode}`);

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
