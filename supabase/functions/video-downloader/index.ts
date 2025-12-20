import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform detection patterns - only TikTok and Instagram
const PLATFORM_PATTERNS = {
  tiktok: /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/|vt\.tiktok\.com\/)(\w+)/i,
  instagram: /(?:instagram\.com\/(?:p|reel|reels|tv)\/)([\w-]+)/i,
};

function detectPlatform(url: string): string {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return 'unknown';
}

// TikWM API (free, no auth) - for TikTok
async function downloadTikTok(url: string, opts: { downloadMode?: "auto" | "audio" } = {}): Promise<any> {
  console.log("Trying TikWM API for TikTok...");

  const response = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `url=${encodeURIComponent(url)}&hd=1`,
  });

  if (!response.ok) {
    throw new Error(`TikWM error: ${response.status}`);
  }

  const data = await response.json();
  console.log("TikWM response code:", data.code);

  if (data.code === 0 && data.data) {
    const title = data.data.title;
    const cover = data.data.cover;

    if (opts.downloadMode === "audio") {
      const audioUrl = data.data.music || data.data.music_info?.play;
      if (!audioUrl) throw new Error("TikWM: No audio URL found");

      return {
        success: true,
        url: audioUrl,
        filename: `${title?.substring(0, 50) || "tiktok-audio"}.mp3`,
        thumbnail: cover,
        title,
      };
    }

    const videoUrl = data.data.hdplay || data.data.play;
    if (videoUrl) {
      return {
        success: true,
        url: videoUrl,
        filename: `${title?.substring(0, 50) || "tiktok-video"}.mp4`,
        thumbnail: cover,
        title,
      };
    }
  }

  throw new Error("TikWM: No media URL found");
}

// =============================================================================
// SNAPSAVE DECRYPTION (based on https://github.com/ahmedrangel/snapsave-media-downloader)
// =============================================================================

function decryptSnapSave(data: string): string {
  // Decode the SnapSave response using their algorithm
  const decodedData = atob(data);
  
  // The algorithm decodes the base64 then applies character transformations
  let result = "";
  for (let i = 0; i < decodedData.length; i++) {
    const charCode = decodedData.charCodeAt(i);
    // Apply XOR with pattern key
    result += String.fromCharCode(charCode ^ (i % 3 === 0 ? 0x53 : i % 3 === 1 ? 0x5A : 0x50));
  }
  
  return result;
}

// Extract video URLs from HTML using regex
function extractVideoUrls(html: string): string[] {
  const urls: string[] = [];
  
  // Pattern 1: Direct MP4 links
  const mp4Regex = /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi;
  const mp4Matches = html.match(mp4Regex) || [];
  urls.push(...mp4Matches);
  
  // Pattern 2: href with download
  const hrefRegex = /href=["']([^"']+)["'][^>]*download/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    if (match[1] && !match[1].includes("javascript:")) {
      urls.push(match[1]);
    }
  }
  
  // Pattern 3: data-url or data-src attributes
  const dataUrlRegex = /data-(?:url|src)=["']([^"']+\.mp4[^"']*)["']/gi;
  while ((match = dataUrlRegex.exec(html)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  
  // Pattern 4: video source
  const srcRegex = /<source[^>]+src=["']([^"']+)["']/gi;
  while ((match = srcRegex.exec(html)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  
  // Deduplicate and filter valid URLs
  return [...new Set(urls)].filter(u => u.startsWith("http"));
}

// Instagram download using multiple methods
async function downloadInstagram(url: string): Promise<any> {
  console.log("Trying Instagram download...");

  const defaultUA =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const withTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, ms = 12000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  };

  // Extract post/reel ID from URL
  const idMatch = url.match(/(?:p|reel|reels|tv)\/([\w-]+)/i);
  const postId = idMatch?.[1] || "unknown";
  console.log("Instagram post ID:", postId);

  const errors: string[] = [];

  // ===================== Method 1: SnapSave.app =====================
  try {
    console.log("Trying SnapSave.app...");
    
    const snapRes = await withTimeout(
      "https://snapsave.app/action.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "*/*",
          "User-Agent": defaultUA,
          Origin: "https://snapsave.app",
          Referer: "https://snapsave.app/",
        },
        body: `url=${encodeURIComponent(url)}`,
      },
      15000
    );

    if (!snapRes.ok) {
      errors.push(`SnapSave HTTP ${snapRes.status}`);
    } else {
      const responseText = await snapRes.text();
      console.log("SnapSave response length:", responseText.length);
      
      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(responseText);
        
        if (jsonData.status === "ok" || jsonData.success) {
          const html = jsonData.data || jsonData.html || "";
          const videoUrls = extractVideoUrls(html);
          
          if (videoUrls.length > 0) {
            console.log("SnapSave success via JSON:", videoUrls[0]);
            return {
              success: true,
              url: videoUrls[0],
              filename: `instagram-${postId}.mp4`,
              title: "Instagram Video",
            };
          }
        }
      } catch {
        // Not JSON, try to extract from raw HTML
        const videoUrls = extractVideoUrls(responseText);
        if (videoUrls.length > 0) {
          console.log("SnapSave success via HTML:", videoUrls[0]);
          return {
            success: true,
            url: videoUrls[0],
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
      }
      
      errors.push("SnapSave: sem link de vídeo");
    }
  } catch (e: any) {
    errors.push(`SnapSave: ${e?.message || e}`);
  }

  // ===================== Method 2: SaveFrom.net style =====================
  try {
    console.log("Trying SaveFrom style...");
    
    const sfRes = await withTimeout(
      "https://api.savefrom.biz/api/convert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": defaultUA,
        },
        body: JSON.stringify({ url }),
      },
      12000
    );

    if (sfRes.ok) {
      const sfData = await sfRes.json();
      const videoUrl = sfData?.url || sfData?.video?.url || sfData?.result?.[0]?.url;
      
      if (videoUrl) {
        console.log("SaveFrom success");
        return {
          success: true,
          url: videoUrl,
          filename: `instagram-${postId}.mp4`,
          title: "Instagram Video",
        };
      }
      errors.push("SaveFrom: sem link mp4");
    } else {
      errors.push(`SaveFrom HTTP ${sfRes.status}`);
    }
  } catch (e: any) {
    errors.push(`SaveFrom: ${e?.message || e}`);
  }

  // ===================== Method 3: igram.world =====================
  try {
    console.log("Trying igram.world...");
    const igramRes = await withTimeout(
      "https://igram.world/api/convert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://igram.world",
          Referer: "https://igram.world/",
        },
        body: JSON.stringify({ url }),
      },
      12000
    );

    if (!igramRes.ok) {
      errors.push(`igram.world HTTP ${igramRes.status}`);
    } else {
      const ct = (igramRes.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        errors.push(`igram.world: content-type inválido (${ct || "n/a"})`);
      } else {
        const igramData = await igramRes.json();
        const items = igramData?.items || igramData?.result || [];
        const list = Array.isArray(items) ? items : [items];
        const video = list.find(
          (i: any) => i?.url && (String(i?.type || "").includes("video") || String(i?.url || "").includes(".mp4"))
        );
        if (video?.url) {
          console.log("igram.world success");
          return {
            success: true,
            url: video.url,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("igram.world: sem link mp4");
      }
    }
  } catch (e: any) {
    errors.push(`igram.world: ${e?.message || e}`);
  }

  // ===================== Method 4: FastDL =====================
  try {
    console.log("Trying FastDL...");
    const fastRes = await withTimeout(
      "https://fastdl.app/api/convert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://fastdl.app",
          Referer: "https://fastdl.app/",
        },
        body: JSON.stringify({ url }),
      },
      12000
    );

    if (!fastRes.ok) {
      errors.push(`FastDL HTTP ${fastRes.status}`);
    } else {
      const ct = (fastRes.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        errors.push(`FastDL: content-type inválido (${ct || "n/a"})`);
      } else {
        const fastData = await fastRes.json();
        const videoUrl = fastData?.url || fastData?.video?.url || fastData?.result?.[0]?.url;
        if (videoUrl) {
          console.log("FastDL success");
          return {
            success: true,
            url: videoUrl,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("FastDL: sem link mp4");
      }
    }
  } catch (e: any) {
    errors.push(`FastDL: ${e?.message || e}`);
  }

  // ===================== Method 5: Cobalt (fallback) =====================
  try {
    console.log("Trying Cobalt for Instagram...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        isAudioOnly: false,
        aFormat: "best",
        vCodec: "h264",
        vQuality: "1080",
        filenamePattern: "basic",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!cobaltRes.ok) {
      errors.push(`Cobalt HTTP ${cobaltRes.status}`);
    } else {
      const cobaltData = (await cobaltRes.json()) as any;

      if (cobaltData?.status === "error") {
        errors.push(`Cobalt: ${cobaltData?.error?.code || "unknown"}`);
      } else if (typeof cobaltData?.url === "string" && cobaltData.url) {
        console.log("Cobalt success for Instagram");
        return {
          success: true,
          url: cobaltData.url,
          filename: `instagram-${postId}.mp4`,
          title: "Instagram Video",
        };
      } else if (cobaltData?.status === "picker" && Array.isArray(cobaltData?.picker) && cobaltData.picker.length) {
        const pickBest = cobaltData.picker[0];
        if (pickBest?.url) {
          console.log("Cobalt picker success for Instagram");
          return {
            success: true,
            url: pickBest.url,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("Cobalt: picker sem URL");
      } else {
        errors.push("Cobalt: sem URL");
      }
    }
  } catch (e: any) {
    errors.push(`Cobalt: ${e?.message || e}`);
  }

  throw new Error(`Instagram: nenhum provedor disponível no momento (${errors.slice(0, 3).join("; ")})`);
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

    if (!url) {
      return json({ success: false, error: "URL é obrigatória" }, 200);
    }

    const platform = detectPlatform(url);
    console.log(`Processing ${platform} URL: ${url}`);

    if (platform === "unknown") {
      return json(
        {
          success: false,
          error: "Plataforma não suportada. Use TikTok ou Instagram.",
        },
        200
      );
    }

    let result: any | null = null;
    let errorMessage: string | undefined;

    try {
      switch (platform) {
        case "tiktok":
          result = await downloadTikTok(url, { downloadMode });
          break;
        case "instagram":
          result = await downloadInstagram(url);
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
    return json(
      {
        success: false,
        error: error?.message || "Erro ao processar requisição",
      },
      200
    );
  }
});