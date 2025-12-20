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
// INSTAGRAM DOWNLOAD - Multiple providers
// =============================================================================

// Clean Instagram URL - remove tracking params
function cleanInstagramUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Keep only the path, remove query params like igsh
    return `https://www.instagram.com${urlObj.pathname}`;
  } catch {
    return url;
  }
}

// Extract video URLs from HTML using multiple patterns
function extractVideoUrls(html: string): string[] {
  const urls: string[] = [];
  
  // Pattern 1: Direct MP4 links (cdninstagram, fbcdn, etc.)
  const cdnRegex = /https?:\/\/[^\s"'<>]*(?:cdninstagram|fbcdn|instagram)[^\s"'<>]*\.mp4[^\s"'<>]*/gi;
  const cdnMatches = html.match(cdnRegex) || [];
  urls.push(...cdnMatches);
  
  // Pattern 2: Any MP4 links
  const mp4Regex = /https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?/gi;
  const mp4Matches = html.match(mp4Regex) || [];
  urls.push(...mp4Matches);
  
  // Pattern 3: href with download attribute
  const hrefDownloadRegex = /href=["']([^"']+)["'][^>]*download/gi;
  let match;
  while ((match = hrefDownloadRegex.exec(html)) !== null) {
    if (match[1] && !match[1].includes("javascript:") && match[1].startsWith("http")) {
      urls.push(match[1]);
    }
  }
  
  // Pattern 4: data-url attributes
  const dataUrlRegex = /data-(?:url|video|src)=["']([^"']+)["']/gi;
  while ((match = dataUrlRegex.exec(html)) !== null) {
    if (match[1] && match[1].startsWith("http")) urls.push(match[1]);
  }

  // Pattern 5: JSON embedded video_url
  const jsonVideoRegex = /"video_url"\s*:\s*"([^"]+)"/gi;
  while ((match = jsonVideoRegex.exec(html)) !== null) {
    if (match[1]) {
      // Decode unicode escapes
      const decoded = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      urls.push(decoded);
    }
  }
  
  // Deduplicate and filter valid URLs
  return [...new Set(urls)].filter(u => u.startsWith("http") && (u.includes(".mp4") || u.includes("video")));
}

// Instagram download using multiple methods
async function downloadInstagram(url: string): Promise<any> {
  console.log("Trying Instagram download...");

  const cleanUrl = cleanInstagramUrl(url);
  console.log("Clean URL:", cleanUrl);

  const defaultUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const withTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, ms = 15000) => {
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

  // ===================== Method 1: SaveVid/SaveIG API =====================
  try {
    console.log("Trying SaveVid API...");
    
    const saveVidRes = await withTimeout(
      "https://v3.savevid.net/api/ajaxSearch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://savevid.net",
          Referer: "https://savevid.net/",
        },
        body: `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
      },
      15000
    );

    if (saveVidRes.ok) {
      const data = await saveVidRes.json();
      console.log("SaveVid response status:", data.status);
      
      if (data.status === "ok" && data.data) {
        const videoUrls = extractVideoUrls(data.data);
        if (videoUrls.length > 0) {
          console.log("SaveVid success:", videoUrls[0].substring(0, 100));
          return {
            success: true,
            url: videoUrls[0],
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("SaveVid: sem link de vídeo no HTML");
      } else {
        errors.push(`SaveVid: status=${data.status || 'unknown'}`);
      }
    } else {
      errors.push(`SaveVid HTTP ${saveVidRes.status}`);
    }
  } catch (e: any) {
    errors.push(`SaveVid: ${e?.message || e}`);
  }

  // ===================== Method 2: SSSSInstagram =====================
  try {
    console.log("Trying SSSInstagram...");
    
    const sssRes = await withTimeout(
      "https://sssinstagram.com/request",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://sssinstagram.com",
          Referer: "https://sssinstagram.com/",
        },
        body: `link=${encodeURIComponent(cleanUrl)}&token=`,
      },
      15000
    );

    if (sssRes.ok) {
      const responseText = await sssRes.text();
      
      // Try to parse as JSON
      try {
        const data = JSON.parse(responseText);
        if (data.url || data.video) {
          console.log("SSSInstagram success (JSON)");
          return {
            success: true,
            url: data.url || data.video,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        
        if (data.html) {
          const videoUrls = extractVideoUrls(data.html);
          if (videoUrls.length > 0) {
            console.log("SSSInstagram success (HTML):", videoUrls[0].substring(0, 100));
            return {
              success: true,
              url: videoUrls[0],
              filename: `instagram-${postId}.mp4`,
              title: "Instagram Video",
            };
          }
        }
      } catch {
        // Try raw HTML
        const videoUrls = extractVideoUrls(responseText);
        if (videoUrls.length > 0) {
          console.log("SSSInstagram success (raw):", videoUrls[0].substring(0, 100));
          return {
            success: true,
            url: videoUrls[0],
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
      }
      errors.push("SSSInstagram: sem link de vídeo");
    } else {
      errors.push(`SSSInstagram HTTP ${sssRes.status}`);
    }
  } catch (e: any) {
    errors.push(`SSSInstagram: ${e?.message || e}`);
  }

  // ===================== Method 3: iGram.io =====================
  try {
    console.log("Trying iGram.io...");
    
    const igramRes = await withTimeout(
      "https://api.igram.io/api/convert",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://igram.io",
          Referer: "https://igram.io/",
        },
        body: JSON.stringify({ url: cleanUrl }),
      },
      15000
    );

    if (igramRes.ok) {
      const ct = (igramRes.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const data = await igramRes.json();
        
        // Check for direct URL
        if (data.url) {
          console.log("iGram.io success (direct URL)");
          return {
            success: true,
            url: data.url,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        
        // Check for items array
        const items = data.items || data.result || data.media || [];
        const list = Array.isArray(items) ? items : [items];
        const video = list.find(
          (i: any) => i?.url && (String(i?.type || "").includes("video") || String(i?.url || "").includes(".mp4"))
        );
        if (video?.url) {
          console.log("iGram.io success (items)");
          return {
            success: true,
            url: video.url,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("iGram.io: sem link de vídeo");
      } else {
        errors.push(`iGram.io: content-type inválido`);
      }
    } else {
      errors.push(`iGram.io HTTP ${igramRes.status}`);
    }
  } catch (e: any) {
    errors.push(`iGram.io: ${e?.message || e}`);
  }

  // ===================== Method 4: SnapInsta =====================
  try {
    console.log("Trying SnapInsta...");
    
    const snapRes = await withTimeout(
      "https://snapinsta.app/api/ajaxSearch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": defaultUA,
          Origin: "https://snapinsta.app",
          Referer: "https://snapinsta.app/",
        },
        body: `q=${encodeURIComponent(cleanUrl)}&t=media&lang=en`,
      },
      15000
    );

    if (snapRes.ok) {
      const ct = (snapRes.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const data = await snapRes.json();
        if (data.status === "ok" && data.data) {
          const videoUrls = extractVideoUrls(data.data);
          if (videoUrls.length > 0) {
            console.log("SnapInsta success");
            return {
              success: true,
              url: videoUrls[0],
              filename: `instagram-${postId}.mp4`,
              title: "Instagram Video",
            };
          }
        }
        errors.push("SnapInsta: sem link de vídeo");
      } else {
        errors.push("SnapInsta: resposta não-JSON");
      }
    } else {
      errors.push(`SnapInsta HTTP ${snapRes.status}`);
    }
  } catch (e: any) {
    errors.push(`SnapInsta: ${e?.message || e}`);
  }

  // ===================== Method 5: FastDL =====================
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
        body: JSON.stringify({ url: cleanUrl }),
      },
      15000
    );

    if (fastRes.ok) {
      const ct = (fastRes.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        const data = await fastRes.json();
        const videoUrl = data?.url || data?.video?.url || data?.result?.[0]?.url;
        if (videoUrl) {
          console.log("FastDL success");
          return {
            success: true,
            url: videoUrl,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }
        errors.push("FastDL: sem link de vídeo");
      } else {
        errors.push("FastDL: resposta não-JSON");
      }
    } else {
      errors.push(`FastDL HTTP ${fastRes.status}`);
    }
  } catch (e: any) {
    errors.push(`FastDL: ${e?.message || e}`);
  }

  // ===================== Method 6: Cobalt (final fallback) =====================
  try {
    console.log("Trying Cobalt for Instagram...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const cobaltRes = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: cleanUrl,
        isAudioOnly: false,
        aFormat: "best",
        vCodec: "h264",
        vQuality: "1080",
        filenamePattern: "basic",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (cobaltRes.ok) {
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
    } else {
      errors.push(`Cobalt HTTP ${cobaltRes.status}`);
    }
  } catch (e: any) {
    errors.push(`Cobalt: ${e?.message || e}`);
  }

  // Log all errors for debugging
  console.log("All Instagram download attempts failed:", errors);

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