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
// YOUTUBE DOWNLOAD via Invidious & Piped public APIs (no auth)
// =============================================================================

const INVIDIOUS_INSTANCES_API = "https://api.invidious.io/instances.json?sort_by=type,users";
const INVIDIOUS_FALLBACKS = [
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://yt.artemislena.eu",
];
const PIPED_INSTANCES_API = "https://piped-instances.kavin.rocks/";
const PIPED_FALLBACKS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
];

type DownloadOpts = {
  downloadMode?: "auto" | "audio";
  videoQuality?: string;
};

// Fetch working Invidious API URLs
async function getInvidiousApiUrls(): Promise<string[]> {
  try {
    const res = await fetch(INVIDIOUS_INSTANCES_API, { headers: { Accept: "application/json" } });
    if (!res.ok) return INVIDIOUS_FALLBACKS;

    const list = (await res.json()) as Array<any>;
    const apiUrls = (Array.isArray(list) ? list : [])
      .map(([hostname, data]: any) => {
        if (!data?.api || data?.type !== "https") return null;
        return `https://${hostname}`;
      })
      .filter(Boolean) as string[];

    return [...new Set([...apiUrls.slice(0, 6), ...INVIDIOUS_FALLBACKS])];
  } catch {
    return INVIDIOUS_FALLBACKS;
  }
}

// Fetch working Piped API URLs
async function getPipedApiUrls(): Promise<string[]> {
  try {
    const res = await fetch(PIPED_INSTANCES_API, { headers: { Accept: "application/json" } });
    if (!res.ok) return PIPED_FALLBACKS;

    const list = (await res.json()) as Array<any>;
    const scored = (Array.isArray(list) ? list : [])
      .map((x) => ({
        api_url: String(x?.api_url || "").trim(),
        score: Number(x?.uptime_24h ?? 0) * 2 + Number(x?.uptime_7d ?? 0),
      }))
      .filter((x) => x.api_url)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.api_url);

    return [...new Set([...scored.slice(0, 6), ...PIPED_FALLBACKS])];
  } catch {
    return PIPED_FALLBACKS;
  }
}

// =========================== INVIDIOUS DOWNLOADER ===========================
async function tryInvidious(
  videoId: string,
  opts: DownloadOpts
): Promise<any | null> {
  const downloadMode = opts.downloadMode || "auto";
  const requestedHeight = (() => {
    const n = parseInt(String(opts.videoQuality || ""), 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  })();

  const instances = await getInvidiousApiUrls();
  console.log("Invidious instances to try:", instances.length);

  for (const base of instances) {
    try {
      const endpoint = `${base}/api/v1/videos/${videoId}`;
      console.log("Invidious endpoint:", endpoint);

      // Add timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint, { 
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        console.log(`Invidious ${base} HTTP ${res.status}`);
        continue;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const raw = await res.text();

      if (!ct.includes("application/json") || raw.includes("<!DOCTYPE")) {
        console.log("Invidious invalid response:", raw.slice(0, 60));
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      const title = data?.title || "youtube-video";
      const thumbnail =
        data?.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // adaptiveFormats + formatStreams available
      const adaptiveFormats: any[] = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
      const formatStreams: any[] = Array.isArray(data?.formatStreams) ? data.formatStreams : [];

      if (downloadMode === "audio") {
        const audios = adaptiveFormats.filter((f) => String(f?.type || "").startsWith("audio/"));
        if (!audios.length) {
          console.log("Invidious no audio streams found");
          continue;
        }
        const best = audios.sort(
          (a, b) => Number(b?.bitrate || 0) - Number(a?.bitrate || 0)
        )[0];
        if (!best?.url) continue;

        return {
          success: true,
          url: best.url,
          filename: `${title}`.slice(0, 80) + ".m4a",
          thumbnail,
          title,
        };
      }

      // Video
      const allVideos = [
        ...formatStreams,
        ...adaptiveFormats.filter((f) => String(f?.type || "").startsWith("video/")),
      ];
      if (!allVideos.length) {
        console.log("Invidious no video streams");
        continue;
      }

      const getHeight = (f: any) => {
        const m = String(f?.resolution || f?.qualityLabel || "").match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      };

      const sorted = allVideos.slice().sort((a, b) => getHeight(b) - getHeight(a));
      const best = sorted.find((f) => getHeight(f) <= requestedHeight) || sorted[0];
      if (!best?.url) continue;

      return {
        success: true,
        url: best.url,
        filename: `${title}`.slice(0, 80) + ".mp4",
        thumbnail,
        title,
      };
    } catch (e: any) {
      console.log("Invidious instance failed:", base, e?.message || e);
    }
  }

  return null;
}

// ============================= PIPED DOWNLOADER =============================
async function tryPiped(
  videoId: string,
  opts: DownloadOpts
): Promise<any | null> {
  const downloadMode = opts.downloadMode || "auto";
  const requestedHeight = (() => {
    const n = parseInt(String(opts.videoQuality || ""), 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  })();

  const instances = await getPipedApiUrls();
  console.log("Piped instances to try:", instances.length);

  for (const base of instances) {
    try {
      const endpoint = `${base}/streams/${videoId}`;
      console.log("Piped endpoint:", endpoint);

      // Add timeout to avoid hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint, { 
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.log(`Piped ${base} HTTP ${res.status}`);
        continue;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const raw = await res.text();

      if (!ct.includes("application/json") || raw.includes("<!DOCTYPE") || raw.includes("Service has been")) {
        console.log("Piped invalid response:", raw.slice(0, 60));
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      const title = data?.title || "youtube-video";
      const thumbnail =
        data?.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      if (downloadMode === "audio") {
        const audioStreams = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
        if (!audioStreams.length) continue;

        const best = audioStreams
          .slice()
          .sort((a: any, b: any) => {
            const qA = parseInt(String(a?.quality || "0"), 10) || 0;
            const qB = parseInt(String(b?.quality || "0"), 10) || 0;
            return qB - qA;
          })[0];

        if (!best?.url) continue;

        return {
          success: true,
          url: best.url,
          filename: `${title}`.slice(0, 80) + ".m4a",
          thumbnail,
          title,
        };
      }

      const videoStreams = Array.isArray(data?.videoStreams) ? data.videoStreams : [];
      const mp4Streams = videoStreams.filter((s: any) =>
        String(s?.mimeType || "").includes("video/") && String(s?.mimeType || "").includes("mp4")
      );
      const candidates = mp4Streams.length ? mp4Streams : videoStreams;

      if (!candidates.length) continue;

      const sorted = candidates
        .slice()
        .sort((a: any, b: any) => Number(b?.height || 0) - Number(a?.height || 0));

      const best = sorted.find((s: any) => Number(s?.height || 0) <= requestedHeight) || sorted[0];
      if (!best?.url) continue;

      return {
        success: true,
        url: best.url,
        filename: `${title}`.slice(0, 80) + ".mp4",
        thumbnail,
        title,
      };
    } catch (e: any) {
      console.log("Piped instance failed:", base, e?.message || e);
    }
  }

  return null;
}

// ============================== COBALT DOWNLOADER =============================
async function tryCobalt(
  url: string,
  videoId: string,
  opts: DownloadOpts
): Promise<any | null> {
  const downloadMode = opts.downloadMode || "auto";
  const isAudioOnly = downloadMode === "audio";

  const requestedHeight = (() => {
    const n = parseInt(String(opts.videoQuality || ""), 10);
    return Number.isFinite(n) ? n : 1080;
  })();

  const vQuality = String(Math.max(144, Math.min(2160, requestedHeight)));
  const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    console.log("Trying YouTube download via Cobalt...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        isAudioOnly,
        aFormat: "best",
        vCodec: "h264",
        vQuality,
        filenamePattern: "basic",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.log("Cobalt non-OK:", res.status);
      return null;
    }

    const data = (await res.json()) as any;

    if (data?.status === "error") {
      console.log("Cobalt error:", data?.error?.code || "unknown");
      return null;
    }

    // tunnel / redirect
    if (typeof data?.url === "string" && data.url) {
      return {
        success: true,
        url: data.url,
        filename: isAudioOnly ? `youtube-${videoId}.mp3` : `youtube-${videoId}.mp4`,
        thumbnail,
        title: "YouTube",
      };
    }

    // picker
    if (data?.status === "picker" && Array.isArray(data?.picker) && data.picker.length) {
      const pickBest = data.picker
        .slice()
        .sort((a: any, b: any) => {
          const qa = parseInt(String(a?.quality || a?.height || 0), 10) || 0;
          const qb = parseInt(String(b?.quality || b?.height || 0), 10) || 0;
          return qb - qa;
        })[0];

      if (pickBest?.url) {
        return {
          success: true,
          url: pickBest.url,
          filename: isAudioOnly ? `youtube-${videoId}.mp3` : `youtube-${videoId}.mp4`,
          thumbnail,
          title: "YouTube",
        };
      }
    }

    return null;
  } catch (e: any) {
    console.log("Cobalt failed:", e?.message || e);
    return null;
  }
}

// ============================== MAIN YOUTUBE ================================
async function downloadYouTube(url: string, opts: DownloadOpts = {}): Promise<any> {
  console.log("Trying YouTube download...");

  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (!match) throw new Error("Invalid YouTube URL");

  const videoId = match[1];

  // 1) Try Invidious first
  const invResult = await tryInvidious(videoId, opts);
  if (invResult) return invResult;

  // 2) Fallback to Piped
  const pipedResult = await tryPiped(videoId, opts);
  if (pipedResult) return pipedResult;

  // 3) Final fallback: Cobalt
  const cobaltResult = await tryCobalt(url, videoId, opts);
  if (cobaltResult) return cobaltResult;

  throw new Error("YouTube indisponível no momento. Todas as instâncias falharam.");
}

// Instagram download via Apify (primary) + lightweight public fallbacks
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

  // Extract post/reel ID from URL for logging
  const idMatch = url.match(/(?:p|reel|reels|tv)\/([\w-]+)/i);
  const postId = idMatch?.[1] || "unknown";
  console.log("Instagram post ID:", postId);

  const errors: string[] = [];

  // ===================== Method 0: Apify (reliable) =====================
  try {
    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    if (apifyToken) {
      console.log("Trying Apify Instagram downloader...");

      const endpoint = `https://api.apify.com/v2/acts/epctex~instagram-video-downloader/run-sync-get-dataset-items?token=${encodeURIComponent(
        apifyToken
      )}&timeout=60`;

      const res = await withTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": defaultUA,
          },
          body: JSON.stringify({
            startUrls: [url],
            quality: "highest",
            compression: "none",
            proxy: { useApifyProxy: true },
          }),
        },
        20000
      );

      if (!res.ok) {
        errors.push(`Apify HTTP ${res.status}`);
      } else {
        const items = (await res.json()) as any[];
        const item = Array.isArray(items) ? items[0] : null;
        const downloadUrl = item?.downloadUrl || item?.download_link || item?.url;

        if (downloadUrl) {
          console.log("Apify success");
          return {
            success: true,
            url: downloadUrl,
            filename: `instagram-${postId}.mp4`,
            title: "Instagram Video",
          };
        }

        errors.push("Apify: sem URL de download");
      }
    } else {
      errors.push("Apify: token ausente");
    }
  } catch (e: any) {
    errors.push(`Apify: ${e?.message || e}`);
  }

  // ===================== Method 1: SnapInsta =====================
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
        body: `q=${encodeURIComponent(url)}&t=media&lang=en`,
      },
      12000
    );

    if (!snapRes.ok) {
      errors.push(`SnapInsta HTTP ${snapRes.status}`);
    } else {
      const ct = (snapRes.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        errors.push(`SnapInsta: content-type inválido (${ct || "n/a"})`);
      } else {
        const snapData = await snapRes.json();
        if (snapData.status === "ok" && snapData.data) {
          const html = String(snapData.data);
          const videoMatch =
            html.match(/href="([^"]+\.mp4[^"]*)"/i) ||
            html.match(/href="([^"]+)"[^>]*download/i);
          if (videoMatch?.[1]) {
            console.log("SnapInsta success");
            return {
              success: true,
              url: videoMatch[1],
              filename: `instagram-${postId}.mp4`,
              title: "Instagram Video",
            };
          }
        }
        errors.push("SnapInsta: sem link mp4");
      }
    }
  } catch (e: any) {
    errors.push(`SnapInsta: ${e?.message || e}`);
  }

  // ===================== Method 2: igram.world =====================
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

  // ===================== Method 3: FastDL =====================
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

  // ===================== Method 4: Cobalt (final fallback) =====================
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
          result = await downloadTikTok(url, { downloadMode });
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
