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

// Apify Actor API (uses existing APIFY_API_TOKEN)
async function downloadWithApify(url: string): Promise<any> {
  const apifyToken = Deno.env.get('APIFY_API_TOKEN');
  
  if (!apifyToken) {
    throw new Error('APIFY_API_TOKEN not configured');
  }
  
  console.log('Starting Apify actor run...');
  
  // Start the actor run
  const startResponse = await fetch(
    `https://api.apify.com/v2/acts/wilcode~all-social-media-video-downloader/runs?token=${apifyToken}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        proxySettings: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
        },
        mergeAV: true,
      }),
    }
  );
  
  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.log('Apify start error:', startResponse.status, errorText);
    throw new Error(`Apify API error: ${startResponse.status}`);
  }
  
  const runData = await startResponse.json();
  const runId = runData.data?.id;
  
  if (!runId) {
    throw new Error('Failed to get Apify run ID');
  }
  
  console.log('Apify run started:', runId);
  
  // Poll for completion (max 60 seconds)
  const maxAttempts = 30;
  const pollInterval = 2000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const statusResponse = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`
    );
    
    if (!statusResponse.ok) {
      continue;
    }
    
    const statusData = await statusResponse.json();
    const status = statusData.data?.status;
    
    console.log(`Apify run status (attempt ${attempt + 1}):`, status);
    
    if (status === 'SUCCEEDED') {
      // Get the results
      const datasetId = statusData.data?.defaultDatasetId;
      
      if (datasetId) {
        const resultsResponse = await fetch(
          `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`
        );
        
        if (resultsResponse.ok) {
          const results = await resultsResponse.json();
          console.log('Apify results:', JSON.stringify(results));
          
          if (results && results.length > 0) {
            const result = results[0];
            
            // Handle different result formats
            if (result.downloadUrl) {
              return {
                success: true,
                url: result.downloadUrl,
                filename: result.title ? `${result.title}.mp4` : 'video.mp4',
                thumbnail: result.thumbnailUrl || result.thumbnail,
                title: result.title,
              };
            }
            
            if (result.videoUrl) {
              return {
                success: true,
                url: result.videoUrl,
                filename: result.title ? `${result.title}.mp4` : 'video.mp4',
                thumbnail: result.thumbnailUrl || result.thumbnail,
                title: result.title,
              };
            }
            
            if (result.url) {
              return {
                success: true,
                url: result.url,
                filename: 'video.mp4',
                thumbnail: result.thumbnail,
                title: result.title,
              };
            }
          }
        }
      }
      
      throw new Error('No download URL in Apify results');
    }
    
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
  }
  
  throw new Error('Apify run timed out');
}

// RapidAPI fallback
async function downloadWithRapidAPI(url: string): Promise<any> {
  const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
  
  if (!rapidApiKey) {
    throw new Error('RapidAPI key not configured');
  }
  
  console.log('Attempting RapidAPI fallback...');
  
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
  
  if (data.medias && data.medias.length > 0) {
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

// Simple direct scraping for TikTok (backup)
async function downloadTikTokDirect(url: string): Promise<any> {
  console.log('Trying TikTok direct method...');
  
  // Try tikwm.com API (free, no auth)
  const tikwmResponse = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `url=${encodeURIComponent(url)}&hd=1`,
  });
  
  if (tikwmResponse.ok) {
    const data = await tikwmResponse.json();
    console.log('TikWM response:', JSON.stringify(data));
    
    if (data.code === 0 && data.data) {
      return {
        success: true,
        url: data.data.hdplay || data.data.play,
        filename: `${data.data.title || 'tiktok-video'}.mp4`,
        thumbnail: data.data.cover,
        title: data.data.title,
      };
    }
  }
  
  throw new Error('TikTok direct download failed');
}

serve(async (req) => {
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
    
    // For TikTok, try the free tikwm API first
    if (platform === 'tiktok') {
      try {
        result = await downloadTikTokDirect(url);
        console.log('TikTok direct succeeded');
      } catch (tikErr: any) {
        console.log('TikTok direct failed:', tikErr.message);
      }
    }
    
    // If no result yet, try Apify (we have the token)
    if (!result) {
      try {
        result = await downloadWithApify(url);
        console.log('Apify succeeded');
      } catch (apifyError: any) {
        console.log('Apify failed:', apifyError.message);
        
        // Try RapidAPI as final fallback
        try {
          result = await downloadWithRapidAPI(url);
          console.log('RapidAPI succeeded');
        } catch (rapidError: any) {
          console.log('RapidAPI also failed:', rapidError.message);
        }
      }
    }
    
    if (!result) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível baixar o vídeo. Verifique se o link está correto e o vídeo está disponível publicamente.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        platform,
        url: result.url,
        filename: result.filename,
        thumbnail: result.thumbnail,
        title: result.title,
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