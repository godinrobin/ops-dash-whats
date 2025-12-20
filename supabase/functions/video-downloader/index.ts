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

// TikWM API (free, no auth) - for TikTok only
async function downloadTikTok(url: string): Promise<any> {
  console.log('Trying TikWM API for TikTok...');
  
  const response = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: `url=${encodeURIComponent(url)}&hd=1`,
  });
  
  if (!response.ok) {
    throw new Error(`TikWM error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('TikWM response code:', data.code);
  
  if (data.code === 0 && data.data) {
    const videoUrl = data.data.hdplay || data.data.play;
    if (videoUrl) {
      return {
        success: true,
        url: videoUrl,
        filename: `${data.data.title?.substring(0, 50) || 'tiktok-video'}.mp4`,
        thumbnail: data.data.cover,
        title: data.data.title,
      };
    }
  }
  
  throw new Error('TikWM: No video URL found');
}

// YouTube download via Piped public API (no auth)
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
];

type DownloadOpts = {
  downloadMode?: "auto" | "audio";
  videoQuality?: string;
};

async function downloadYouTube(url: string, opts: DownloadOpts = {}): Promise<any> {
  console.log("Trying YouTube download via Piped...");

  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (!match) throw new Error("Invalid YouTube URL");

  const videoId = match[1];
  const downloadMode = opts.downloadMode || "auto";

  const requestedHeight = (() => {
    const n = parseInt(String(opts.videoQuality || ""), 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  })();

  let lastError = "";

  for (const base of PIPED_INSTANCES) {
    try {
      const endpoint = `${base}/streams/${videoId}`;
      console.log("Piped endpoint:", endpoint);

      const res = await fetch(endpoint, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        lastError = `Piped error: ${res.status}`;
        console.log("Piped non-OK:", lastError);
        continue;
      }

      const data = await res.json();

      const title = data?.title || "youtube-video";
      const thumbnail = data?.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      if (downloadMode === "audio") {
        const audioStreams = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
        if (!audioStreams.length) throw new Error("Piped: No audio streams");

        const bestAudio = audioStreams
          .slice()
          .sort((a: any, b: any) => {
            const qA = parseInt(String(a?.quality || "0"), 10) || 0;
            const qB = parseInt(String(b?.quality || "0"), 10) || 0;
            return qB - qA;
          })[0];

        if (!bestAudio?.url) throw new Error("Piped: Missing audio URL");

        return {
          success: true,
          url: bestAudio.url,
          filename: `${title}`.slice(0, 80) + ".m4a",
          thumbnail,
          title,
        };
      }

      const videoStreams = Array.isArray(data?.videoStreams) ? data.videoStreams : [];
      const mp4Streams = videoStreams.filter((s: any) => String(s?.mimeType || "").includes("video/") && String(s?.mimeType || "").includes("mp4"));
      const candidates = mp4Streams.length ? mp4Streams : videoStreams;

      if (!candidates.length) throw new Error("Piped: No video streams");

      const bestVideo = candidates
        .slice()
        .sort((a: any, b: any) => (Number(b?.height || 0) - Number(a?.height || 0)))
        .find((s: any) => Number(s?.height || 0) <= requestedHeight) ||
        candidates.slice().sort((a: any, b: any) => (Number(b?.height || 0) - Number(a?.height || 0)))[0];

      if (!bestVideo?.url) throw new Error("Piped: Missing video URL");

      return {
        success: true,
        url: bestVideo.url,
        filename: `${title}`.slice(0, 80) + ".mp4",
        thumbnail,
        title,
      };
    } catch (e: any) {
      lastError = e?.message || String(e);
      console.log("Piped instance failed:", base, lastError);
    }
  }

  throw new Error(lastError || "YouTube download failed");
}

// Instagram download via igram.io
async function downloadInstagram(url: string): Promise<any> {
  console.log('Trying Instagram download...');
  
  // Try saveig.app API
  const response = await fetch('https://v3.saveig.app/api/ajaxSearch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://saveig.app',
      'Referer': 'https://saveig.app/',
    },
    body: `q=${encodeURIComponent(url)}&t=media&lang=en`,
  });
  
  if (!response.ok) {
    throw new Error(`SaveIG error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('SaveIG response status:', data.status);
  
  if (data.status === 'ok' && data.data) {
    // Parse HTML response to get video URL
    const html = data.data;
    const videoMatch = html.match(/href="([^"]+)"[^>]*download/);
    if (videoMatch) {
      return {
        success: true,
        url: videoMatch[1],
        filename: 'instagram-video.mp4',
        title: 'Instagram Video',
      };
    }
  }
  
  throw new Error('Instagram download failed');
}

// Twitter/X download
async function downloadTwitter(url: string): Promise<any> {
  console.log('Trying Twitter download...');
  
  const response = await fetch('https://twitsave.com/info?url=' + encodeURIComponent(url), {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  
  if (!response.ok) {
    throw new Error(`TwitSave error: ${response.status}`);
  }
  
  const html = await response.text();
  
  // Extract video URL from HTML
  const videoMatch = html.match(/https:\/\/[^"]+\.mp4[^"]*/);
  if (videoMatch) {
    return {
      success: true,
      url: videoMatch[0],
      filename: 'twitter-video.mp4',
      title: 'Twitter Video',
    };
  }
  
  throw new Error('Twitter download failed');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // ignore – handled below
    }

    const url = typeof body?.url === "string" ? body.url : "";
    const downloadMode = typeof body?.downloadMode === "string" ? body.downloadMode : "auto";
    const videoQuality = typeof body?.videoQuality === "string" ? body.videoQuality : "1080";

    if (!url) {
      // IMPORTANT: always return 200 so the web client can read the error message
      return json({ success: false, error: "URL é obrigatória" }, 200);
    }

    const platform = detectPlatform(url);
    console.log(`Processing ${platform} URL: ${url}`);

    if (platform === "unknown") {
      return json(
        {
          success: false,
          error: "Plataforma não suportada. Use YouTube, TikTok, Instagram ou Twitter.",
        },
        200
      );
    }

    let result: any | null = null;
    let errorMessage: string | undefined;

    try {
      switch (platform) {
        case "tiktok":
          result = await downloadTikTok(url);
          break;
        case "youtube":
          result = await downloadYouTube(url, { downloadMode, videoQuality });
          break;
        case "instagram":
          result = await downloadInstagram(url);
          break;
        case "twitter":
          result = await downloadTwitter(url);
          break;
        default:
          throw new Error("Plataforma não suportada");
      }
    } catch (e: any) {
      errorMessage = e?.message || String(e);
      console.log(`${platform} download failed:`, errorMessage);
    }

    if (!result?.url) {
      return json(
        {
          success: false,
          error:
            `Não foi possível baixar o vídeo do ${platform}. ` +
            (errorMessage || "Verifique se o link está correto e o vídeo está disponível publicamente."),
        },
        200
      );
    }

    return json(
      {
        success: true,
        platform,
        url: result.url,
        filename: result.filename,
        thumbnail: result.thumbnail,
        title: result.title,
      },
      200
    );
  } catch (error: any) {
    console.error("Unhandled error in video-downloader:", error);
    // Still return 200 to avoid `Edge Function returned a non-2xx status code` in the client.
    return json(
      {
        success: false,
        error: error?.message || "Erro ao processar requisição",
      },
      200
    );
  }
});
