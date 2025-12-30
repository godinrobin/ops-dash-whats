import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INBOX_MEDIA_BUCKET = 'video-clips';

const guessExtension = (contentType: string | null, fallback: string) => {
  const ct = (contentType || '').toLowerCase();

  if (ct.includes('image/')) {
    const ext = ct.split('image/')[1]?.split(';')[0] || 'jpg';
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (ct.includes('audio/')) {
    return ct.split('audio/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('video/')) {
    return ct.split('video/')[1]?.split(';')[0] || fallback;
  }
  if (ct.includes('application/pdf')) return 'pdf';
  return fallback;
};

// Download media via Evolution API getBase64FromMediaMessage endpoint
const downloadMediaViaEvolutionAPI = async (
  instanceName: string,
  remoteJid: string,
  messageId: string,
  evolutionBaseUrl?: string,
  evolutionApiKey?: string
): Promise<{ base64: string; mimetype: string } | null> => {
  try {
    const baseUrl = evolutionBaseUrl || Deno.env.get('EVOLUTION_BASE_URL')?.replace(/\/$/, '');
    const apiKey = evolutionApiKey || Deno.env.get('EVOLUTION_API_KEY');
    
    if (!baseUrl || !apiKey) {
      console.log('[MEDIA-FALLBACK] No Evolution API config available');
      return null;
    }
    
    console.log(`[MEDIA-FALLBACK] Fetching media via Evolution API: instance=${instanceName}, messageId=${messageId}`);
    
    const response = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          key: {
            remoteJid: remoteJid,
            id: messageId,
          }
        },
        convertToMp4: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[MEDIA-FALLBACK] API error: status=${response.status}, body=${errorText.substring(0, 200)}`);
      return null;
    }
    
    const result = await response.json();
    
    if (result.base64 && result.mimetype) {
      console.log(`[MEDIA-FALLBACK] Success! mimetype=${result.mimetype}, size=${result.base64.length} chars`);
      return { base64: result.base64, mimetype: result.mimetype };
    }
    
    console.log(`[MEDIA-FALLBACK] No base64 in response:`, JSON.stringify(result).substring(0, 200));
    return null;
  } catch (err) {
    console.error('[MEDIA-FALLBACK] Error:', err);
    return null;
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messageId } = await req.json();

    if (!messageId) {
      return new Response(JSON.stringify({ success: false, error: 'messageId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MEDIA-FALLBACK] Processing request for message: ${messageId}`);

    // Get the message with contact info
    const { data: message, error: msgError } = await supabaseClient
      .from('inbox_messages')
      .select(`
        *,
        contact:inbox_contacts!inbox_messages_contact_id_fkey (
          id,
          remote_jid,
          phone,
          instance_id
        )
      `)
      .eq('id', messageId)
      .eq('user_id', user.id)
      .single();

    if (msgError || !message) {
      console.log(`[MEDIA-FALLBACK] Message not found: ${messageId}`);
      return new Response(JSON.stringify({ success: false, error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if media is already persisted
    if (message.media_url && message.media_url.includes('/storage/v1/object/public/')) {
      console.log(`[MEDIA-FALLBACK] Media already persisted: ${message.media_url}`);
      return new Response(JSON.stringify({ success: true, media_url: message.media_url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contact = message.contact;
    if (!contact) {
      return new Response(JSON.stringify({ success: false, error: 'Contact not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get instance info for Evolution API
    const { data: instance, error: instanceError } = await supabaseClient
      .from('maturador_instances')
      .select('instance_name, evolution_base_url, evolution_api_key')
      .eq('id', contact.instance_id)
      .single();

    if (instanceError || !instance) {
      console.log(`[MEDIA-FALLBACK] Instance not found: ${contact.instance_id}`);
      return new Response(JSON.stringify({ success: false, error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Need remote_jid and remote_message_id to fetch from Evolution API
    const remoteJid = contact.remote_jid || `${contact.phone}@s.whatsapp.net`;
    const remoteMessageId = message.remote_message_id;

    if (!remoteMessageId) {
      console.log(`[MEDIA-FALLBACK] No remote_message_id for message: ${messageId}`);
      return new Response(JSON.stringify({ success: false, error: 'No remote message ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[MEDIA-FALLBACK] Attempting to fetch media from Evolution API`);
    console.log(`  instance: ${instance.instance_name}`);
    console.log(`  remoteJid: ${remoteJid}`);
    console.log(`  remoteMessageId: ${remoteMessageId}`);

    // Try to download via Evolution API
    const evolutionResult = await downloadMediaViaEvolutionAPI(
      instance.instance_name,
      remoteJid,
      remoteMessageId,
      instance.evolution_base_url || undefined,
      instance.evolution_api_key || undefined
    );

    if (!evolutionResult) {
      console.log(`[MEDIA-FALLBACK] Failed to download media from Evolution API`);
      return new Response(JSON.stringify({ success: false, error: 'Failed to download media' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(evolutionResult.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    const contentType = evolutionResult.mimetype;

    console.log(`[MEDIA-FALLBACK] Downloaded: size=${arrayBuffer.byteLength}, mimetype=${contentType}`);

    // Determine file extension
    const fallbackExt = (() => {
      switch (message.message_type) {
        case 'image': return 'jpg';
        case 'audio': return 'ogg';
        case 'video': return 'mp4';
        case 'sticker': return 'webp';
        case 'document': return 'bin';
        default: return 'bin';
      }
    })();

    const blob = new Blob([arrayBuffer], { type: contentType || 'application/octet-stream' });
    const ext = guessExtension(contentType, fallbackExt);
    const objectPath = `inbox-media/${user.id}/${contact.instance_id}/${message.message_type}/${remoteMessageId}.${ext}`;

    console.log(`[MEDIA-FALLBACK] Uploading to storage: ${objectPath}`);

    // Upload to storage
    const { error: uploadError } = await supabaseClient
      .storage
      .from(INBOX_MEDIA_BUCKET)
      .upload(objectPath, blob, {
        contentType: contentType || undefined,
        upsert: true,
        cacheControl: '31536000',
      });

    if (uploadError) {
      console.error(`[MEDIA-FALLBACK] Upload failed:`, uploadError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload media' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get public URL
    const { data: urlData } = await supabaseClient.storage.from(INBOX_MEDIA_BUCKET).getPublicUrl(objectPath);
    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to get public URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update message with new URL
    const { error: updateError } = await supabaseClient
      .from('inbox_messages')
      .update({ media_url: publicUrl })
      .eq('id', messageId);

    if (updateError) {
      console.error(`[MEDIA-FALLBACK] Failed to update message:`, updateError);
    }

    console.log(`[MEDIA-FALLBACK] Success! New URL: ${publicUrl}`);

    return new Response(JSON.stringify({ success: true, media_url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[MEDIA-FALLBACK] Unexpected error:', err);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
