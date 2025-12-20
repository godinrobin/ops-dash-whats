import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform detection patterns
const PLATFORM_PATTERNS = {
  youtube: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  tiktok: /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/|vt\.tiktok\.com\/)(\w+)/i,
  instagram: /(?:instagram\.com\/(?:p|reel|reels|tv)\/)([\w-]+)/i,
  twitter: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  facebook: /(?:facebook\.com|fb\.watch)\/(?:watch\/?\?v=|reel\/|[\w.]+\/videos\/)(\d+)?/i,
};

function detectPlatform(url: string): string {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return 'unknown';
}

// Cobalt API (Free, primary)
async function downloadWithCobalt(url: string, options: { downloadMode: string; videoQuality: string }): Promise<any> {
  console.log('Attempting Cobalt API...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
  
  try {
    const response = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        downloadMode: options.downloadMode === 'audio' ? 'audio' : 'auto',
        videoQuality: options.videoQuality || '1080',
        audioFormat: 'mp3',
        audioBitrate: '320',
        filenameStyle: 'pretty',
        tiktokFullAudio: true,
        tiktokH265: false,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Cobalt error response:', response.status, errorText);
      throw new Error(`Cobalt API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Cobalt response:', JSON.stringify(data));
    
    if (data.status === 'error') {
      throw new Error(data.text || 'Cobalt returned error');
    }
    
    // Handle different response types
    if (data.status === 'redirect' || data.status === 'tunnel') {
      return {
        success: true,
        url: data.url,
        filename: data.filename || 'video.mp4',
      };
    }
    
    if (data.status === 'picker' && data.picker && data.picker.length > 0) {
      // Return first option for simplicity
      return {
        success: true,
        url: data.picker[0].url,
        filename: 'video.mp4',
      };
    }
    
    throw new Error('Unexpected Cobalt response format');
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// RapidAPI fallback
async function downloadWithRapidAPI(url: string, platform: string): Promise<any> {
  const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
  
  if (!rapidApiKey) {
    throw new Error('RapidAPI key not configured');
  }
  
  console.log('Attempting RapidAPI fallback...');
  
  // Use All-in-One Social Media Downloader
  const response = await fetch('https://all-social-media-video-downloader.p.rapidapi.com/v1/social/autolink', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'all-social-media-video-downloader.p.rapidapi.com',
    },
    body: JSON.stringify({ url }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('RapidAPI error:', response.status, errorText);
    throw new Error(`RapidAPI error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('RapidAPI response:', JSON.stringify(data));
  
  // Handle RapidAPI response format
  if (data.medias && data.medias.length > 0) {
    // Sort by quality (prefer highest)
    const sortedMedias = data.medias.sort((a: any, b: any) => {
      const qualityA = parseInt(a.quality) || 0;
      const qualityB = parseInt(b.quality) || 0;
      return qualityB - qualityA;
    });
    
    const bestMedia = sortedMedias[0];
    return {
      success: true,
      url: bestMedia.url,
      filename: data.title ? `${data.title}.mp4` : 'video.mp4',
      thumbnail: data.thumbnail,
      title: data.title,
    };
  }
  
  if (data.url) {
    return {
      success: true,
      url: data.url,
      filename: 'video.mp4',
    };
  }
  
  throw new Error('No download URL found in RapidAPI response');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const { url, downloadMode = 'auto', videoQuality = '1080' } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const platform = detectPlatform(url);
    console.log(`Processing ${platform} URL: ${url}`);
    
    if (platform === 'unknown') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Plataforma não suportada. Use YouTube, TikTok, Instagram, Twitter ou Facebook.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let result;
    let usedFallback = false;
    
    // Try Cobalt first (free)
    try {
      result = await downloadWithCobalt(url, { downloadMode, videoQuality });
      console.log('Cobalt succeeded');
    } catch (cobaltError: any) {
      console.log('Cobalt failed:', cobaltError.message);
      
      // Try RapidAPI as fallback
      try {
        result = await downloadWithRapidAPI(url, platform);
        usedFallback = true;
        console.log('RapidAPI fallback succeeded');
      } catch (rapidError: any) {
        console.log('RapidAPI also failed:', rapidError.message);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Não foi possível baixar o vídeo. Verifique se o link está correto e o vídeo está disponível publicamente.' 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        platform,
        url: result.url,
        filename: result.filename,
        thumbnail: result.thumbnail,
        title: result.title,
        // Don't expose which API was used to the user
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('Error in video-downloader:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro ao processar requisição' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});