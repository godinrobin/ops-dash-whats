import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USD_TO_BRL = 6.10;
const PROFIT_MARGIN = 1.30;
const PLATFORM_MARKUP = 1.21; // 10% original + 10% adicional = 21%

// Traduções de categorias
const categoryTranslations: Record<string, string> = {
  'Instagram Followers': 'Instagram Seguidores',
  'Instagram Likes': 'Instagram Curtidas',
  'Instagram Views': 'Instagram Visualizações',
  'Instagram Comments': 'Instagram Comentários',
  'Instagram Story': 'Instagram Stories',
  'Instagram Reels': 'Instagram Reels',
  'Instagram Live': 'Instagram Lives',
  'Instagram Saves': 'Instagram Salvamentos',
  'Instagram Shares': 'Instagram Compartilhamentos',
  'YouTube Views': 'YouTube Visualizações',
  'YouTube Subscribers': 'YouTube Inscritos',
  'YouTube Likes': 'YouTube Curtidas',
  'YouTube Comments': 'YouTube Comentários',
  'YouTube Watch Time': 'YouTube Tempo de Exibição',
  'YouTube Shares': 'YouTube Compartilhamentos',
  'TikTok Followers': 'TikTok Seguidores',
  'TikTok Likes': 'TikTok Curtidas',
  'TikTok Views': 'TikTok Visualizações',
  'TikTok Shares': 'TikTok Compartilhamentos',
  'TikTok Comments': 'TikTok Comentários',
  'TikTok Saves': 'TikTok Salvamentos',
  'Facebook Followers': 'Facebook Seguidores',
  'Facebook Likes': 'Facebook Curtidas',
  'Facebook Page Likes': 'Facebook Curtidas de Página',
  'Facebook Post Likes': 'Facebook Curtidas de Post',
  'Facebook Views': 'Facebook Visualizações',
  'Facebook Comments': 'Facebook Comentários',
  'Facebook Shares': 'Facebook Compartilhamentos',
  'Twitter Followers': 'Twitter/X Seguidores',
  'Twitter Likes': 'Twitter/X Curtidas',
  'Twitter Retweets': 'Twitter/X Retweets',
  'Twitter Views': 'Twitter/X Visualizações',
  'Telegram Members': 'Telegram Membros',
  'Telegram Post Views': 'Telegram Visualizações',
  'Telegram Reactions': 'Telegram Reações',
  'Spotify Followers': 'Spotify Seguidores',
  'Spotify Plays': 'Spotify Reproduções',
  'Spotify Saves': 'Spotify Salvamentos',
  'SoundCloud Followers': 'SoundCloud Seguidores',
  'SoundCloud Plays': 'SoundCloud Reproduções',
  'SoundCloud Likes': 'SoundCloud Curtidas',
  'LinkedIn Followers': 'LinkedIn Seguidores',
  'LinkedIn Likes': 'LinkedIn Curtidas',
  'LinkedIn Comments': 'LinkedIn Comentários',
  'Pinterest Followers': 'Pinterest Seguidores',
  'Pinterest Saves': 'Pinterest Pins',
  'Pinterest Repins': 'Pinterest Repins',
  'Twitch Followers': 'Twitch Seguidores',
  'Twitch Views': 'Twitch Visualizações',
  'Discord Members': 'Discord Membros',
  'Website Traffic': 'Tráfego de Sites',
  'Threads Followers': 'Threads Seguidores',
  'Threads Likes': 'Threads Curtidas',
  'Kwai Followers': 'Kwai Seguidores',
  'Kwai Likes': 'Kwai Curtidas',
  'Kwai Views': 'Kwai Visualizações',
};

// Traduções de termos comuns em nomes de serviços
const nameTranslations: Record<string, string> = {
  'Followers': 'Seguidores',
  'followers': 'seguidores',
  'Likes': 'Curtidas',
  'likes': 'curtidas',
  'Views': 'Visualizações',
  'views': 'visualizações',
  'Comments': 'Comentários',
  'comments': 'comentários',
  'Shares': 'Compartilhamentos',
  'shares': 'compartilhamentos',
  'Subscribers': 'Inscritos',
  'subscribers': 'inscritos',
  'Members': 'Membros',
  'members': 'membros',
  'Saves': 'Salvamentos',
  'saves': 'salvamentos',
  'Watch Time': 'Tempo de Exibição',
  'watch time': 'tempo de exibição',
  'Reactions': 'Reações',
  'reactions': 'reações',
  'Plays': 'Reproduções',
  'plays': 'reproduções',
  'Real': 'Reais',
  'real': 'reais',
  'Instant': 'Instantâneo',
  'instant': 'instantâneo',
  'Fast': 'Rápido',
  'fast': 'rápido',
  'Slow': 'Lento',
  'slow': 'lento',
  'High Quality': 'Alta Qualidade',
  'high quality': 'alta qualidade',
  'HQ': 'Alta Qualidade',
  'Premium': 'Premium',
  'Cheap': 'Econômico',
  'cheap': 'econômico',
  'Bot': 'Bot',
  'Refill': 'Reposição',
  'refill': 'reposição',
  'No Refill': 'Sem Reposição',
  'no refill': 'sem reposição',
  'Lifetime': 'Vitalício',
  'lifetime': 'vitalício',
  'Guaranteed': 'Garantido',
  'guaranteed': 'garantido',
  'Non Drop': 'Sem Queda',
  'non drop': 'sem queda',
  'No Drop': 'Sem Queda',
  'no drop': 'sem queda',
  'Drop': 'Queda',
  'drop': 'queda',
  'Active': 'Ativos',
  'active': 'ativos',
  'Targeted': 'Segmentado',
  'targeted': 'segmentado',
  'Worldwide': 'Mundial',
  'worldwide': 'mundial',
  'Global': 'Global',
  'Brazil': 'Brasil',
  'Brazilian': 'Brasileiro',
  'USA': 'EUA',
  'Minutes': 'Minutos',
  'minutes': 'minutos',
  'Hours': 'Horas',
  'hours': 'horas',
  'Days': 'Dias',
  'days': 'dias',
  'Post': 'Post',
  'post': 'post',
  'Story': 'Story',
  'story': 'story',
  'Reel': 'Reel',
  'reel': 'reel',
  'Video': 'Vídeo',
  'video': 'vídeo',
  'Photo': 'Foto',
  'photo': 'foto',
  'Profile': 'Perfil',
  'profile': 'perfil',
  'Page': 'Página',
  'page': 'página',
  'Channel': 'Canal',
  'channel': 'canal',
  'Group': 'Grupo',
  'group': 'grupo',
  'Live': 'Ao Vivo',
  'live': 'ao vivo',
  'Stream': 'Transmissão',
  'stream': 'transmissão',
  'per': 'por',
  'Per': 'Por',
  'day': 'dia',
  'Day': 'Dia',
  'hour': 'hora',
  'Hour': 'Hora',
  'Custom': 'Personalizado',
  'custom': 'personalizado',
  'Random': 'Aleatório',
  'random': 'aleatório',
  'Mixed': 'Misto',
  'mixed': 'misto',
  'Male': 'Masculino',
  'male': 'masculino',
  'Female': 'Feminino',
  'female': 'feminino',
  'Speed': 'Velocidade',
  'speed': 'velocidade',
  'Start': 'Início',
  'start': 'início',
  'Complete': 'Completo',
  'complete': 'completo',
  'Max': 'Máx',
  'max': 'máx',
  'Min': 'Mín',
  'min': 'mín',
  'Impressions': 'Impressões',
  'impressions': 'impressões',
  'Reach': 'Alcance',
  'reach': 'alcance',
  'Engagement': 'Engajamento',
  'engagement': 'engajamento',
  'Traffic': 'Tráfego',
  'traffic': 'tráfego',
  'Organic': 'Orgânico',
  'organic': 'orgânico',
};

function translateCategory(category: string): string {
  if (categoryTranslations[category]) {
    return categoryTranslations[category];
  }
  
  for (const [key, value] of Object.entries(categoryTranslations)) {
    if (category.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  
  return category;
}

function translateServiceName(name: string): string {
  let translated = name;
  
  // Ordenar por tamanho decrescente para traduzir frases maiores primeiro
  const sortedEntries = Object.entries(nameTranslations).sort((a, b) => b[0].length - a[0].length);
  
  for (const [english, portuguese] of sortedEntries) {
    // Usar regex para substituir palavras inteiras
    const regex = new RegExp(`\\b${english}\\b`, 'g');
    translated = translated.replace(regex, portuguese);
  }
  
  return translated;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('SMMRAJA_API_KEY');
    if (!apiKey) {
      throw new Error('SMMRAJA_API_KEY not configured');
    }

    console.log('Fetching SMM services...');
    
    const response = await fetch('https://www.smmraja.com/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: apiKey,
        action: 'services',
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const services = await response.json();
    console.log(`Fetched ${services.length} services`);
    
    // Log sample service to verify rate format
    if (services.length > 0) {
      console.log('Sample service:', JSON.stringify(services[0]));
    }

    // Transform and translate services
    const transformedServices = services.map((service: any) => {
      const rateUsd = parseFloat(service.rate);
      const pricePer1000Brl = rateUsd * USD_TO_BRL * PROFIT_MARGIN;
      const priceWithMarkup = pricePer1000Brl * PLATFORM_MARKUP;

      return {
        id: service.service,
        name: translateServiceName(service.name),
        nameOriginal: service.name,
        category: service.category,
        categoryPt: translateCategory(service.category),
        type: service.type,
        rateUsd: rateUsd,
        pricePer1000Brl: pricePer1000Brl,
        priceWithMarkup: priceWithMarkup,
        min: parseInt(service.min),
        max: parseInt(service.max),
        dripfeed: service.dripfeed,
        refill: service.refill,
        cancel: service.cancel,
        description: service.desc || '',
      };
    });

    // Group by category
    const categories = [...new Set(transformedServices.map((s: any) => s.category))];
    const categoriesPt = [...new Set(transformedServices.map((s: any) => s.categoryPt))];

    return new Response(JSON.stringify({
      success: true,
      services: transformedServices,
      categories: categories,
      categoriesPt: categoriesPt,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error fetching SMM services:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});