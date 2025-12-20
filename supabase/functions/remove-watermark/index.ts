import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FAL_KEY = Deno.env.get("FAL_KEY");

// Fal.ai endpoints
const FAL_FFMPEG_URL = "https://queue.fal.run/fal-ai/ffmpeg-api";
const FAL_LAMA_INPAINT_URL = "https://queue.fal.run/fal-ai/lama";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body = await req.json();

    // Check status of async job
    if (body.checkStatus && body.requestId) {
      return await checkJobStatus(body.requestId);
    }

    const { videoBase64, mask, videoDimensions } = body;

    if (!FAL_KEY) {
      throw new Error("FAL_KEY not configured");
    }

    if (!videoBase64 || !mask) {
      throw new Error("Video and mask region are required");
    }

    console.log("Processing watermark removal request");
    console.log("Mask region:", mask);
    console.log("Video dimensions:", videoDimensions);

    // Extract base64 data (remove data:video/... prefix)
    const base64Data = videoBase64.split(",")[1];
    
    // Upload video to temporary storage via data URL
    const videoDataUrl = `data:video/mp4;base64,${base64Data}`;

    // Step 1: Extract frames from video using FFmpeg API
    console.log("Extracting frames from video...");
    
    const extractFramesResponse = await fetch(FAL_FFMPEG_URL + "/frames", {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_url: videoDataUrl,
        fps: 24, // Extract at 24fps
      }),
    });

    if (!extractFramesResponse.ok) {
      const errorText = await extractFramesResponse.text();
      console.error("FFmpeg frames extraction error:", errorText);
      
      // Fallback: Process video directly with simpler approach
      return await processVideoSimple(videoDataUrl, mask, videoDimensions);
    }

    const framesResult = await extractFramesResponse.json();
    console.log("Frames extracted:", framesResult);

    // If we got frames, process each one
    if (framesResult.frames && framesResult.frames.length > 0) {
      return await processFrames(framesResult.frames, mask, videoDimensions, framesResult.fps || 24);
    }

    // Fallback to simple processing
    return await processVideoSimple(videoDataUrl, mask, videoDimensions);

  } catch (error) {
    console.error("Error in remove-watermark:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function checkJobStatus(requestId: string) {
  try {
    const statusResponse = await fetch(
      `https://queue.fal.run/fal-ai/lama/requests/${requestId}/status`,
      {
        method: "GET",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
        },
      }
    );

    const statusData = await statusResponse.json();

    if (statusData.status === "COMPLETED") {
      const resultResponse = await fetch(
        `https://queue.fal.run/fal-ai/lama/requests/${requestId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Key ${FAL_KEY}`,
          },
        }
      );

      const resultData = await resultResponse.json();
      return new Response(
        JSON.stringify({
          status: "done",
          videoUrl: resultData.image?.url || resultData.video?.url,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: statusData.status === "IN_QUEUE" ? "processing" : statusData.status.toLowerCase(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking status:", error);
    return new Response(
      JSON.stringify({ status: "failed", error: "Failed to check status" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function processVideoSimple(videoDataUrl: string, mask: any, videoDimensions: any) {
  console.log("Using simple video processing approach...");

  // For now, we'll extract a frame and apply inpainting to demonstrate
  // Full video processing would require more complex frame-by-frame processing

  // Create a mask image (white rectangle on black background)
  const maskWidth = videoDimensions.width || 1920;
  const maskHeight = videoDimensions.height || 1080;

  // Use LaMa inpainting on the first frame as a proof of concept
  // In production, this would process each frame

  try {
    // Try direct inpainting with the video as an image source
    const inpaintResponse = await fetch(FAL_LAMA_INPAINT_URL, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: videoDataUrl,
        mask_url: generateMaskDataUrl(mask, maskWidth, maskHeight),
      }),
    });

    if (!inpaintResponse.ok) {
      const errorText = await inpaintResponse.text();
      console.error("LaMa inpainting error:", errorText);
      throw new Error("Inpainting failed: " + errorText);
    }

    const inpaintResult = await inpaintResponse.json();
    console.log("Inpainting result:", inpaintResult);

    // Check if it's an async request
    if (inpaintResult.request_id) {
      return new Response(
        JSON.stringify({
          status: "processing",
          requestId: inpaintResult.request_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the processed image/video URL
    return new Response(
      JSON.stringify({
        status: "done",
        videoUrl: inpaintResult.image?.url || inpaintResult.output?.url,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Simple processing error:", error);
    throw error;
  }
}

async function processFrames(frames: string[], mask: any, videoDimensions: any, fps: number) {
  console.log(`Processing ${frames.length} frames...`);

  const maskWidth = videoDimensions.width || 1920;
  const maskHeight = videoDimensions.height || 1080;
  const maskDataUrl = generateMaskDataUrl(mask, maskWidth, maskHeight);

  const processedFrames: string[] = [];

  // Process frames in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (frameUrl) => {
      const response = await fetch(FAL_LAMA_INPAINT_URL, {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: frameUrl,
          mask_url: maskDataUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Frame processing failed: ${response.status}`);
      }

      const result = await response.json();
      return result.image?.url;
    });

    const batchResults = await Promise.all(batchPromises);
    processedFrames.push(...batchResults.filter(Boolean));
    
    console.log(`Processed ${Math.min(i + batchSize, frames.length)}/${frames.length} frames`);
  }

  // Merge frames back into video using FFmpeg
  const mergeResponse = await fetch(FAL_FFMPEG_URL + "/merge-frames", {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      frame_urls: processedFrames,
      fps: fps,
    }),
  });

  if (!mergeResponse.ok) {
    const errorText = await mergeResponse.text();
    throw new Error(`Frame merge failed: ${errorText}`);
  }

  const mergeResult = await mergeResponse.json();

  return new Response(
    JSON.stringify({
      status: "done",
      videoUrl: mergeResult.video?.url || mergeResult.output?.url,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function generateMaskDataUrl(mask: any, width: number, height: number): string {
  // Create a simple SVG mask (white rectangle on black background)
  // This is a simplified approach - in production you'd generate a proper binary mask
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="black"/>
      <rect x="${mask.x}" y="${mask.y}" width="${mask.width}" height="${mask.height}" fill="white"/>
    </svg>
  `;

  const base64Svg = btoa(svg);
  return `data:image/svg+xml;base64,${base64Svg}`;
}
