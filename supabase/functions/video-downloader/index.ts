import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform detection pattern - only TikTok
const TIKTOK_PATTERN = /(?:tiktok\.com\/@[\w.-]+\/video\/|vm\.tiktok\.com\/|tiktok\.com\/t\/|vt\.tiktok\.com\/)(\w+)/i;

function isTikTokUrl(url: string): boolean {
  return TIKTOK_PATTERN.test(url);
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

    if (!isTikTokUrl(url)) {
      return json(
        {
          success: false,
          error: "Link inválido. Use apenas links do TikTok.",
        },
        200
      );
    }

    console.log(`Processing TikTok URL: ${url}`);

    let result: any | null = null;
    let errorMessage: string | undefined;

    try {
      result = await downloadTikTok(url, { downloadMode });
    } catch (e: any) {
      errorMessage = e?.message || String(e);
      console.log("TikTok download failed:", errorMessage);
    }

    if (!result?.url) {
      return json(
        {
          success: false,
          error:
            "Não foi possível baixar o vídeo do TikTok. " +
            (errorMessage || "Verifique se o link está correto e o vídeo está disponível publicamente."),
        },
        200
      );
    }

    return json(
      {
        success: true,
        platform: "tiktok",
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